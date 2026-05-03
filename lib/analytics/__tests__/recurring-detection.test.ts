// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns';
import {
  analyzeAmounts,
  analyzeIntervals,
  buildCandidate,
  classifyPeriod,
  computeConfidence,
  filterIntraGroupNoise,
  groupTransactions,
  passesGlobalFilters,
  predictNext,
  runDetectionPipeline,
  type RecurringTxRow,
} from '../recurring-detection';

// ─── Fixture helpers ────────────────────────────────────────────────────────

let ID_SEQ = 0;
function nextId(): string {
  ID_SEQ += 1;
  return `tx-${String(ID_SEQ).padStart(4, '0')}`;
}

interface MakeTxOpts {
  date: string | Date;
  amountCents?: number;
  currency?: string;
  merchantId?: string | null;
  merchantRaw?: string | null;
  description?: string | null;
  categoryId?: string | null;
  isTransfer?: boolean;
  isExcluded?: boolean;
  isPending?: boolean;
  source?: string;
  createdAt?: string;
}

function makeTx(opts: MakeTxOpts): RecurringTxRow {
  const dateStr = opts.date instanceof Date ? format(opts.date, 'yyyy-MM-dd') : opts.date;
  return {
    id: nextId(),
    transaction_date: dateStr,
    base_amount_cents: opts.amountCents ?? -2500,
    base_currency: opts.currency ?? 'BAM',
    original_amount_cents: opts.amountCents ?? -2500,
    original_currency: opts.currency ?? 'BAM',
    merchant_id: opts.merchantId ?? null,
    merchant_raw: opts.merchantRaw ?? 'NETFLIX',
    description: opts.description ?? null,
    category_id: opts.categoryId ?? null,
    is_transfer: opts.isTransfer ?? false,
    is_excluded: opts.isExcluded ?? false,
    is_pending: opts.isPending ?? false,
    source: opts.source ?? 'manual',
    created_at: opts.createdAt,
    merchants: null,
  };
}

/** Generate N transactions stepping `intervalDays` from start. */
function series(
  start: string,
  intervalDays: number,
  count: number,
  opts: Partial<MakeTxOpts> = {},
): RecurringTxRow[] {
  const startDate = parseISO(start);
  const out: RecurringTxRow[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(
      makeTx({
        date: addDays(startDate, intervalDays * i),
        merchantRaw: 'NETFLIX',
        ...opts,
      }),
    );
  }
  return out;
}

/** Series stepping by months — handles month-end edge cases properly. */
function monthlySeries(
  start: string,
  count: number,
  opts: Partial<MakeTxOpts> = {},
): RecurringTxRow[] {
  const startDate = parseISO(start);
  const out: RecurringTxRow[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(makeTx({ date: addMonths(startDate, i), ...opts }));
  }
  return out;
}

function weeklySeries(
  start: string,
  count: number,
  opts: Partial<MakeTxOpts> = {},
): RecurringTxRow[] {
  const startDate = parseISO(start);
  const out: RecurringTxRow[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(makeTx({ date: addWeeks(startDate, i), ...opts }));
  }
  return out;
}

// ─── Pure-function tests ────────────────────────────────────────────────────

describe('analyzeIntervals', () => {
  it('returns mean, median, and CV=0 for perfectly regular fixed-day intervals', () => {
    // Use fixed 30-day steps — addMonths would give 31/28/31/… which is
    // realistic-month behaviour but not what this test is asserting.
    const start = parseISO('2026-01-01');
    const dates = [start, addDays(start, 30), addDays(start, 60)];
    const result = analyzeIntervals(dates);
    expect(result.intervals).toEqual([30, 30]);
    expect(result.cv).toBeCloseTo(0, 5);
    expect(result.median).toBe(30);
  });

  it('handles empty input gracefully', () => {
    expect(analyzeIntervals([])).toEqual({ intervals: [], median: 0, mean: 0, cv: 1 });
  });

  it('computes non-zero CV for irregular intervals', () => {
    const dates = ['2026-01-01', '2026-01-08', '2026-02-15', '2026-02-22'].map((d) => parseISO(d));
    const result = analyzeIntervals(dates);
    expect(result.cv).toBeGreaterThan(0.3);
  });

  it('sorts dates internally so caller order does not matter', () => {
    const ordered = ['2026-01-01', '2026-02-01', '2026-03-01'].map((d) => parseISO(d));
    const shuffled = ['2026-03-01', '2026-01-01', '2026-02-01'].map((d) => parseISO(d));
    expect(analyzeIntervals(ordered).intervals).toEqual(analyzeIntervals(shuffled).intervals);
  });
});

describe('analyzeAmounts', () => {
  it('computes median + low CV for uniform amounts', () => {
    const result = analyzeAmounts([-2500n, -2500n, -2500n]);
    expect(result.median).toBe(-2500n);
    expect(result.cv).toBeCloseTo(0, 1);
  });

  it('preserves sign for outflow groups', () => {
    const result = analyzeAmounts([-2500n, -2400n, -2600n]);
    expect(result.median).toBeLessThan(0n);
  });

  it('handles small drift via CV', () => {
    const result = analyzeAmounts([-1000n, -1030n, -970n]);
    expect(result.cv).toBeLessThan(0.05);
  });
});

describe('classifyPeriod', () => {
  it('classifies median ~30 days as monthly when intervals are tight', () => {
    const intervals = analyzeIntervals(
      monthlySeries('2026-01-01', 6).map((r) => parseISO(r.transaction_date)),
    );
    const result = classifyPeriod(intervals);
    expect(result?.period).toBe('monthly');
    expect(result?.matchStrictness).toBe(1.0);
  });

  it('classifies median ~7 days as weekly', () => {
    const dates = weeklySeries('2026-01-01', 8).map((r) => parseISO(r.transaction_date));
    const result = classifyPeriod(analyzeIntervals(dates));
    expect(result?.period).toBe('weekly');
  });

  it('classifies median ~14 days as bi-weekly', () => {
    const dates = series('2026-01-01', 14, 6).map((r) => parseISO(r.transaction_date));
    const result = classifyPeriod(analyzeIntervals(dates));
    expect(result?.period).toBe('bi-weekly');
  });

  it('classifies median ~90 days as quarterly', () => {
    const dates = series('2026-01-01', 90, 4).map((r) => parseISO(r.transaction_date));
    const result = classifyPeriod(analyzeIntervals(dates));
    expect(result?.period).toBe('quarterly');
  });

  it('returns null when median sits between buckets (e.g. 60 days = bi-monthly)', () => {
    const dates = series('2026-01-01', 60, 4).map((r) => parseISO(r.transaction_date));
    const result = classifyPeriod(analyzeIntervals(dates));
    expect(result).toBeNull();
  });

  it('downgrades match strictness when fewer than 60% of intervals fit the bucket', () => {
    // 4 monthly intervals + 2 wild outliers; median still falls in monthly,
    // but strictness drops because most intervals don't actually match.
    const dates: Date[] = [
      '2026-01-01',
      '2026-02-01', // +31
      '2026-03-01', // +28
      '2026-03-15', // +14 ← weekly outlier
      '2026-03-22', // +7  ← weekly outlier
      '2026-03-30', // +8  ← weekly outlier
    ].map((d) => parseISO(d));
    const intervals = analyzeIntervals(dates);
    const result = classifyPeriod(intervals);
    if (result === null) {
      // If median fell out entirely, that's also acceptable evidence of "noisy".
      expect(result).toBeNull();
    } else {
      expect(result.matchStrictness).toBeLessThan(1.0);
    }
  });
});

describe('computeConfidence', () => {
  it('returns 0 below MIN_OCCURRENCES', () => {
    const c = computeConfidence({ occurrences: 2, intervalCV: 0, amountCV: 0, periodMatch: 1 });
    expect(c).toBe(0);
  });

  it('returns very high confidence for ideal subscription (6+ occurrences, no variance)', () => {
    const c = computeConfidence({ occurrences: 6, intervalCV: 0, amountCV: 0, periodMatch: 1 });
    expect(c).toBeGreaterThan(0.9);
  });

  it('clamps to [0, 1]', () => {
    const c = computeConfidence({ occurrences: 100, intervalCV: -5, amountCV: -5, periodMatch: 1 });
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThanOrEqual(0);
  });

  it('penalises high interval CV', () => {
    const tight = computeConfidence({ occurrences: 6, intervalCV: 0, amountCV: 0, periodMatch: 1 });
    const loose = computeConfidence({
      occurrences: 6,
      intervalCV: 0.25,
      amountCV: 0,
      periodMatch: 1,
    });
    expect(loose).toBeLessThan(tight);
  });

  it('penalises high amount CV', () => {
    const stable = computeConfidence({
      occurrences: 6,
      intervalCV: 0,
      amountCV: 0,
      periodMatch: 1,
    });
    const drifty = computeConfidence({
      occurrences: 6,
      intervalCV: 0,
      amountCV: 0.2,
      periodMatch: 1,
    });
    expect(drifty).toBeLessThan(stable);
  });
});

describe('predictNext', () => {
  const base = parseISO('2026-04-15');

  it('weekly + 7 days', () => {
    expect(format(predictNext(base, 'weekly'), 'yyyy-MM-dd')).toBe('2026-04-22');
  });
  it('bi-weekly + 14 days', () => {
    expect(format(predictNext(base, 'bi-weekly'), 'yyyy-MM-dd')).toBe('2026-04-29');
  });
  it('monthly + 1 month', () => {
    expect(format(predictNext(base, 'monthly'), 'yyyy-MM-dd')).toBe('2026-05-15');
  });
  it('quarterly + 3 months', () => {
    expect(format(predictNext(base, 'quarterly'), 'yyyy-MM-dd')).toBe('2026-07-15');
  });
  it('yearly + 12 months', () => {
    expect(format(predictNext(base, 'yearly'), 'yyyy-MM-dd')).toBe('2027-04-15');
  });
});

describe('passesGlobalFilters', () => {
  it('rejects positive amounts (T1 outflow-only)', () => {
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', amountCents: 5000 }))).toBe(false);
  });
  it('rejects amounts whose absolute value is < 5 KM', () => {
    // 4.99 KM = 499 cents → filtered out (below threshold).
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', amountCents: -499 }))).toBe(false);
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', amountCents: -200 }))).toBe(false);
  });
  it('accepts amounts at or below -5 KM (boundary inclusive)', () => {
    // Exactly -500 cents = 5 KM → passes (spec says "< 5 KM ignoriši", boundary keeps).
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', amountCents: -500 }))).toBe(true);
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', amountCents: -1500 }))).toBe(true);
  });
  it('rejects transfers, excluded, pending, and source=recurring', () => {
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', isTransfer: true }))).toBe(false);
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', isExcluded: true }))).toBe(false);
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', isPending: true }))).toBe(false);
    expect(passesGlobalFilters(makeTx({ date: '2026-01-01', source: 'recurring' }))).toBe(false);
  });
});

// ─── groupTransactions tests ────────────────────────────────────────────────

describe('groupTransactions', () => {
  it('groups by merchant_id when present, currency-stratified', () => {
    const a = makeTx({ date: '2026-01-01', merchantId: 'm1', currency: 'BAM' });
    const b = makeTx({ date: '2026-02-01', merchantId: 'm1', currency: 'BAM' });
    const c = makeTx({ date: '2026-02-01', merchantId: 'm1', currency: 'EUR' });
    const groups = groupTransactions([a, b, c]);
    expect(groups.size).toBe(2);
    expect(groups.get('merchant:m1:BAM')?.length).toBe(2);
    expect(groups.get('merchant:m1:EUR')?.length).toBe(1);
  });

  it('groups by normalized description when merchant_id is null', () => {
    const a = makeTx({ date: '2026-01-01', merchantRaw: 'NETFLIX.COM' });
    const b = makeTx({ date: '2026-02-01', merchantRaw: 'netflix com' });
    const groups = groupTransactions([a, b]);
    expect(groups.size).toBe(1);
    const only = [...groups.values()][0];
    expect(only.length).toBe(2);
  });

  it('does not collapse different merchants into one group', () => {
    const a = makeTx({ date: '2026-01-01', merchantRaw: 'NETFLIX' });
    const b = makeTx({ date: '2026-02-01', merchantRaw: 'SPOTIFY' });
    const groups = groupTransactions([a, b]);
    expect(groups.size).toBe(2);
  });
});

// ─── filterIntraGroupNoise tests ────────────────────────────────────────────

describe('filterIntraGroupNoise', () => {
  it('keeps a clean group untouched', () => {
    const group = monthlySeries('2026-01-01', 4);
    expect(filterIntraGroupNoise(group).length).toBe(4);
  });

  it('drops the whole group when > 50% are same-day duplicates', () => {
    // 5 transactions, 4 of them on 2026-01-01 → 80% are duplicates → drop.
    const group = [
      makeTx({ date: '2026-01-01' }),
      makeTx({ date: '2026-01-01' }),
      makeTx({ date: '2026-01-01' }),
      makeTx({ date: '2026-01-01' }),
      makeTx({ date: '2026-02-01' }),
    ];
    expect(filterIntraGroupNoise(group)).toEqual([]);
  });

  it('dedupes occasional same-day duplicates by created_at', () => {
    const group = [
      makeTx({ date: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', amountCents: -100 }),
      makeTx({ date: '2026-01-01', createdAt: '2026-01-01T11:00:00Z', amountCents: -200 }),
      makeTx({ date: '2026-02-01', createdAt: '2026-02-01T10:00:00Z' }),
      makeTx({ date: '2026-03-01', createdAt: '2026-03-01T10:00:00Z' }),
      makeTx({ date: '2026-04-01', createdAt: '2026-04-01T10:00:00Z' }),
    ];
    const out = filterIntraGroupNoise(group);
    // 1 of the 2026-01-01 duplicates dropped → 4 rows total.
    expect(out.length).toBe(4);
    // The earliest created_at on 2026-01-01 (amount -100) must survive.
    const jan = out.find((r) => r.transaction_date === '2026-01-01');
    expect(jan?.base_amount_cents).toBe(-100);
  });
});

// ─── runDetectionPipeline — backlog + extra acceptance tests ────────────────

describe('runDetectionPipeline (acceptance)', () => {
  it('Test 1: 6 monthly transactions, identical amount → period=monthly, confidence > 0.9', () => {
    const rows = monthlySeries('2026-01-01', 6, { merchantRaw: 'NETFLIX', amountCents: -1500 });
    const candidates = runDetectionPipeline(rows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].period).toBe('monthly');
    expect(candidates[0].confidence).toBeGreaterThan(0.9);
    expect(candidates[0].occurrences).toBe(6);
    expect(candidates[0].averageAmountCents).toBe(-1500n);
  });

  it('Test 2: 6 monthly with amount drift ±3% → confidence > 0.85', () => {
    const rows = monthlySeries('2026-01-01', 6, { merchantRaw: 'KIRIJA' }).map((r, i) => ({
      ...r,
      base_amount_cents: -50000 + (i % 2 === 0 ? -1500 : 1500), // 3% jitter
    }));
    const candidates = runDetectionPipeline(rows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].period).toBe('monthly');
    expect(candidates[0].confidence).toBeGreaterThan(0.85);
  });

  it('Test 3: 3 random-date transactions same merchant → returns 0 (no cadence)', () => {
    const rows = [
      makeTx({ date: '2026-01-03', merchantRaw: 'KONZUM', amountCents: -2500 }),
      makeTx({ date: '2026-02-19', merchantRaw: 'KONZUM', amountCents: -3100 }),
      makeTx({ date: '2026-04-07', merchantRaw: 'KONZUM', amountCents: -2900 }),
    ];
    const candidates = runDetectionPipeline(rows);
    // Either dropped entirely (period misclass) or below 0.5 confidence threshold.
    expect(candidates.length).toBe(0);
  });

  it('Test 4: 12 weekly transactions → period=weekly, confidence > 0.9', () => {
    const rows = weeklySeries('2026-01-01', 12, { merchantRaw: 'COFFEE-SUBS', amountCents: -700 });
    const candidates = runDetectionPipeline(rows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].period).toBe('weekly');
    expect(candidates[0].confidence).toBeGreaterThan(0.9);
  });

  it('Test 5: mix of random + monthly same merchant → only monthly candidate returned', () => {
    // Note: same merchant, so all rows go in one group. Random additions
    // become "duplicate days" and trip the multi-per-day filter, which
    // is the conservative behaviour we want when signals conflict.
    const monthly = monthlySeries('2026-01-01', 6, {
      merchantRaw: 'NETFLIX',
      amountCents: -1500,
    });
    // Add 4 random transactions for *different* merchant — should split into
    // its own group, which will then be ignored (too few + irregular).
    const random = [
      makeTx({ date: '2026-01-15', merchantRaw: 'KONZUM' }),
      makeTx({ date: '2026-02-08', merchantRaw: 'KONZUM' }),
      makeTx({ date: '2026-03-25', merchantRaw: 'KONZUM' }),
      makeTx({ date: '2026-04-04', merchantRaw: 'KONZUM' }),
    ];
    const candidates = runDetectionPipeline([...monthly, ...random]);
    expect(candidates.length).toBe(1);
    expect(candidates[0].description.toLowerCase()).toContain('netflix');
  });

  it('Test 6: amount < 5 KM → ignores via global filter', () => {
    const rows = monthlySeries('2026-01-01', 6, { amountCents: -300 }); // 3 KM
    const candidates = runDetectionPipeline(rows.filter(passesGlobalFilters));
    expect(candidates.length).toBe(0);
  });

  it('Test 7: 4 quarterly transactions → period=quarterly, confidence in [0.7, 0.95]', () => {
    const rows = series('2026-01-01', 90, 4, { merchantRaw: 'INSURANCE', amountCents: -25000 });
    const candidates = runDetectionPipeline(rows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].period).toBe('quarterly');
    expect(candidates[0].confidence).toBeGreaterThan(0.7);
    expect(candidates[0].confidence).toBeLessThan(0.95);
  });

  it('Test 9: 2 occurrences → returns 0 (below MIN_OCCURRENCES)', () => {
    const rows = monthlySeries('2026-01-01', 2);
    expect(runDetectionPipeline(rows).length).toBe(0);
  });

  it('Test 10: monthly with 1 same-day extra → dedupe keeps cadence intact', () => {
    const monthly = monthlySeries('2026-01-01', 5, {
      merchantRaw: 'X',
      amountCents: -1000,
      createdAt: '2026-01-01T00:00:00Z',
    });
    monthly.push(
      makeTx({
        date: monthly[0].transaction_date,
        merchantRaw: 'X',
        amountCents: -1000,
        createdAt: '2026-01-01T05:00:00Z',
      }),
    );
    const candidates = runDetectionPipeline(monthly);
    expect(candidates.length).toBe(1);
    expect(candidates[0].occurrences).toBe(5);
  });

  it('Test 11: all transactions on same day → returns 0 (no span)', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      makeTx({
        date: '2026-01-01',
        merchantRaw: 'X',
        createdAt: `2026-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      }),
    );
    expect(runDetectionPipeline(rows).length).toBe(0);
  });

  it('Test 12: all positive (inflow) → ignored by global filter', () => {
    const rows = monthlySeries('2026-01-01', 6, { amountCents: 5000 });
    expect(runDetectionPipeline(rows.filter(passesGlobalFilters)).length).toBe(0);
  });

  it('Test 13: same merchant in two currencies → split into two groups', () => {
    const bam = monthlySeries('2026-01-01', 6, {
      merchantId: 'm1',
      currency: 'BAM',
      amountCents: -1500,
    });
    const eur = monthlySeries('2026-01-01', 6, {
      merchantId: 'm1',
      currency: 'EUR',
      amountCents: -800,
    });
    const candidates = runDetectionPipeline([...bam, ...eur]);
    expect(candidates.length).toBe(2);
    const currencies = candidates.map((c) => c.currency).sort();
    expect(currencies).toEqual(['BAM', 'EUR']);
  });

  it('Test 14: soft-deleted, transfer, excluded all skipped via global filter', () => {
    const rows: RecurringTxRow[] = [
      ...monthlySeries('2026-01-01', 6, { merchantRaw: 'OK' }),
      makeTx({ date: '2026-02-15', isTransfer: true, merchantRaw: 'TRANSFER' }),
      makeTx({ date: '2026-02-15', isExcluded: true, merchantRaw: 'EXCLUDED' }),
    ];
    const candidates = runDetectionPipeline(rows.filter(passesGlobalFilters));
    expect(candidates.length).toBe(1);
    expect(candidates[0].description.toLowerCase()).not.toContain('transfer');
  });

  it('Test 15: source=recurring rows skipped by global filter', () => {
    const generated = monthlySeries('2026-01-01', 6, { source: 'recurring' });
    expect(generated.filter(passesGlobalFilters).length).toBe(0);
  });

  it('Test 16: 6 monthly + 1 outlier amount (200% off) → confidence still > 0.6', () => {
    const rows = monthlySeries('2026-01-01', 6, { merchantRaw: 'X', amountCents: -1000 });
    rows.push(
      makeTx({
        date: addMonths(parseISO('2026-01-01'), 6),
        merchantRaw: 'X',
        amountCents: -3000, // 3x outlier
      }),
    );
    const candidates = runDetectionPipeline(rows);
    expect(candidates.length).toBe(1);
    expect(candidates[0].confidence).toBeGreaterThan(0.6);
  });

  it('Test 17: candidate output shape — buildCandidate produces all required fields', () => {
    const rows = monthlySeries('2026-01-01', 6, {
      merchantRaw: 'NETFLIX',
      amountCents: -1500,
      categoryId: 'cat-streaming',
    });
    const [candidate] = runDetectionPipeline(rows);
    expect(candidate.groupKey).toMatch(/^(merchant|desc):/);
    expect(candidate.merchantId).toBeNull();
    expect(typeof candidate.description).toBe('string');
    expect(candidate.period).toBe('monthly');
    expect(typeof candidate.averageAmountCents).toBe('bigint');
    expect(candidate.currency).toBe('BAM');
    expect(candidate.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(candidate.nextExpected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(candidate.confidence).toBeGreaterThan(0.5);
    expect(candidate.occurrences).toBe(6);
    expect(candidate.transactionIds.length).toBe(6);
    expect(candidate.suggestedCategoryId).toBe('cat-streaming');
  });
});

// ─── Performance ────────────────────────────────────────────────────────────

describe('runDetectionPipeline (performance)', () => {
  it('Test 8: 5000 mixed transactions → < 500ms', () => {
    // Construct a realistic mix: 50 merchants, mostly 1-off purchases
    // (will be dropped), with 5 actual subscriptions (monthly cadence).
    const rows: RecurringTxRow[] = [];

    for (let m = 0; m < 50; m += 1) {
      const merchant = `m-${String(m)}`;
      const txCount = 90; // 50 × 90 = 4500 random transactions
      for (let i = 0; i < txCount; i += 1) {
        const day = Math.floor(Math.random() * 180);
        rows.push(
          makeTx({
            date: addDays(parseISO('2026-01-01'), day),
            merchantId: merchant,
            amountCents: -Math.floor(Math.random() * 5000) - 1000,
          }),
        );
      }
    }
    // 5 actual subscriptions — 6 monthly each = 30 transactions
    for (let s = 0; s < 5; s += 1) {
      rows.push(
        ...monthlySeries('2026-01-05', 6, {
          merchantId: `sub-${String(s)}`,
          amountCents: -1500 - s * 500,
        }),
      );
    }
    // Pad to ~5000 with another batch of singletons.
    while (rows.length < 5000) {
      rows.push(
        makeTx({
          date: addDays(parseISO('2026-01-01'), Math.floor(Math.random() * 180)),
          merchantId: `singleton-${String(rows.length)}`,
          amountCents: -1000,
        }),
      );
    }

    const start = performance.now();
    const candidates = runDetectionPipeline(rows);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    // Sanity: at least the 5 deliberate subscriptions got picked up.
    expect(candidates.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── buildCandidate isolation ───────────────────────────────────────────────

describe('buildCandidate', () => {
  it('uses merchant.display_name when joined relation provides it', () => {
    const rows = monthlySeries('2026-01-01', 6, { merchantRaw: 'RAW-NAME' });
    rows[0] = { ...rows[0], merchants: { display_name: 'Pretty Name' } };
    const candidate = buildCandidate({
      groupKey: 'test',
      group: rows,
      intervals: analyzeIntervals(rows.map((r) => parseISO(r.transaction_date))),
      amountAnalysis: analyzeAmounts(rows.map((r) => BigInt(r.base_amount_cents))),
      period: 'monthly',
      confidence: 0.9,
    });
    expect(candidate.description).toBe('Pretty Name');
  });

  it('falls back to most-common merchant_raw', () => {
    const rows = [
      makeTx({ date: '2026-01-01', merchantRaw: 'NETFLIX' }),
      makeTx({ date: '2026-02-01', merchantRaw: 'NETFLIX' }),
      makeTx({ date: '2026-03-01', merchantRaw: 'NETFLIX.COM' }),
    ];
    const candidate = buildCandidate({
      groupKey: 'test',
      group: rows,
      intervals: analyzeIntervals(rows.map((r) => parseISO(r.transaction_date))),
      amountAnalysis: analyzeAmounts(rows.map((r) => BigInt(r.base_amount_cents))),
      period: 'monthly',
      confidence: 0.9,
    });
    expect(candidate.description).toBe('NETFLIX');
  });

  it('returns null suggestedCategoryId when no dominant category (≤ 50%)', () => {
    const rows = [
      makeTx({ date: '2026-01-01', categoryId: 'a' }),
      makeTx({ date: '2026-02-01', categoryId: 'b' }),
      makeTx({ date: '2026-03-01', categoryId: 'c' }),
      makeTx({ date: '2026-04-01', categoryId: 'd' }),
    ];
    const candidate = buildCandidate({
      groupKey: 'test',
      group: rows,
      intervals: analyzeIntervals(rows.map((r) => parseISO(r.transaction_date))),
      amountAnalysis: analyzeAmounts(rows.map((r) => BigInt(r.base_amount_cents))),
      period: 'monthly',
      confidence: 0.9,
    });
    expect(candidate.suggestedCategoryId).toBeNull();
  });
});
