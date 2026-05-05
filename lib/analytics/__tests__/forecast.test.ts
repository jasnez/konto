// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, format } from 'date-fns';
import {
  _resetEventDateMap,
  aggregateHistoryStats,
  computeBaseline,
  findLowestPoint,
  findRunway,
  forecastCashflow,
  generateInstallmentEvents,
  generateRecurringEvents,
  projectDayByDay,
  type AccountRow,
  type InstallmentRow,
  type RecurringRow,
} from '../forecast';

const NOW = new Date('2026-04-15T12:00:00Z');
const TODAY_ISO = format(NOW, 'yyyy-MM-dd');

// ─── Pure function tests ────────────────────────────────────────────────────

describe('aggregateHistoryStats', () => {
  it('returns zero values for empty input', () => {
    const s = aggregateHistoryStats([]);
    expect(s).toEqual({
      firstDate: null,
      lastDate: null,
      totalOutflowCents: 0n,
      totalInflowCents: 0n,
      activeDays: 0,
    });
  });

  it('separates outflows and inflows by sign', () => {
    const s = aggregateHistoryStats([
      { transaction_date: '2026-04-01', base_amount_cents: -1000 },
      { transaction_date: '2026-04-02', base_amount_cents: 5000 },
      { transaction_date: '2026-04-03', base_amount_cents: -2000 },
    ]);
    expect(s.totalOutflowCents).toBe(3000n);
    expect(s.totalInflowCents).toBe(5000n);
    expect(s.activeDays).toBe(3);
    expect(s.firstDate).toBe('2026-04-01');
    expect(s.lastDate).toBe('2026-04-03');
  });

  it('counts unique active days, not transaction count', () => {
    const s = aggregateHistoryStats([
      { transaction_date: '2026-04-01', base_amount_cents: -100 },
      { transaction_date: '2026-04-01', base_amount_cents: -200 },
      { transaction_date: '2026-04-01', base_amount_cents: -300 },
    ]);
    expect(s.activeDays).toBe(1);
  });
});

describe('computeBaseline', () => {
  it('returns zero when activeDays is 0', () => {
    const b = computeBaseline(
      {
        firstDate: null,
        lastDate: null,
        totalOutflowCents: 0n,
        totalInflowCents: 0n,
        activeDays: 0,
      },
      0n,
    );
    expect(b).toEqual({ outflowCents: 0n, inflowCents: 0n });
  });

  it('subtracts the recurring monthly contribution from history outflow', () => {
    // 90 days × 100 cents / day → 9000 total → 100 cents/day
    // Minus 30 cents/day recurring → 70 cents/day baseline.
    const b = computeBaseline(
      {
        firstDate: '2026-01-01',
        lastDate: '2026-03-31',
        totalOutflowCents: 9000n,
        totalInflowCents: 0n,
        activeDays: 90,
      },
      900n, // monthly recurring outflow
    );
    expect(b.outflowCents).toBe(70n);
  });

  it('clamps negative baseline outflow to 0 (subscription-heavy spender)', () => {
    const b = computeBaseline(
      {
        firstDate: '2026-01-01',
        lastDate: '2026-03-31',
        totalOutflowCents: 1000n,
        totalInflowCents: 0n,
        activeDays: 90,
      },
      // Recurring eats more than the entire history outflow.
      99_999n,
    );
    expect(b.outflowCents).toBe(0n);
  });
});

describe('findLowestPoint', () => {
  it('returns null for empty projections', () => {
    expect(findLowestPoint([])).toBeNull();
  });

  it('finds the day with the smallest balance', () => {
    const days = [
      { date: '2026-04-16', balanceCents: 1000n, inflowCents: 0n, outflowCents: 0n, events: [] },
      { date: '2026-04-17', balanceCents: 500n, inflowCents: 0n, outflowCents: 0n, events: [] },
      { date: '2026-04-18', balanceCents: 800n, inflowCents: 0n, outflowCents: 0n, events: [] },
    ];
    expect(findLowestPoint(days)).toEqual({ date: '2026-04-17', balanceCents: 500n });
  });
});

describe('findRunway', () => {
  it('returns null when balance never goes negative', () => {
    const days = [
      { date: '2026-04-16', balanceCents: 1000n, inflowCents: 0n, outflowCents: 0n, events: [] },
      { date: '2026-04-17', balanceCents: 500n, inflowCents: 0n, outflowCents: 0n, events: [] },
    ];
    expect(findRunway(days)).toBeNull();
  });

  it('returns the 1-based day index where balance first crosses below 0', () => {
    const days = [
      { date: '2026-04-16', balanceCents: 100n, inflowCents: 0n, outflowCents: 0n, events: [] },
      { date: '2026-04-17', balanceCents: 50n, inflowCents: 0n, outflowCents: 0n, events: [] },
      { date: '2026-04-18', balanceCents: -10n, inflowCents: 0n, outflowCents: 0n, events: [] },
    ];
    expect(findRunway(days)).toBe(3);
  });
});

// ─── Recurring + installment generators ─────────────────────────────────────

afterEach(() => {
  _resetEventDateMap();
});

describe('generateRecurringEvents', () => {
  it('emits one event per occurrence inside the horizon for monthly cadence', async () => {
    const recurring: RecurringRow[] = [
      {
        id: 'r1',
        description: 'Netflix',
        period: 'monthly',
        average_amount_cents: -1500,
        currency: 'BAM',
        next_expected_date: '2026-05-01',
        last_seen_date: '2026-04-01',
        paused_until: null,
        active: true,
      },
    ];
    // 90 days from 2026-04-15 → through ~2026-07-14.
    // Monthly cadence anchored at 2026-05-01 → events at 05-01, 06-01, 07-01.
    const events = await generateRecurringEvents(recurring, NOW, 90, 'BAM', TODAY_ISO, true);
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.type).toBe('recurring');
      expect(e.amountCents).toBe(-1500n);
      expect(e.sourceId).toBe('r1');
    }
  });

  it('respects paused_until — emits nothing while paused', async () => {
    const recurring: RecurringRow[] = [
      {
        id: 'r1',
        description: 'Netflix',
        period: 'monthly',
        average_amount_cents: -1500,
        currency: 'BAM',
        next_expected_date: '2026-05-01',
        last_seen_date: '2026-04-01',
        // Paused well past the horizon.
        paused_until: '2099-12-31',
        active: true,
      },
    ];
    const events = await generateRecurringEvents(recurring, NOW, 90, 'BAM', TODAY_ISO, true);
    expect(events).toHaveLength(0);
  });

  it('skips inactive subscriptions', async () => {
    const events = await generateRecurringEvents(
      [
        {
          id: 'r1',
          description: 'X',
          period: 'monthly',
          average_amount_cents: -1500,
          currency: 'BAM',
          next_expected_date: '2026-05-01',
          last_seen_date: null,
          paused_until: null,
          active: false,
        },
      ],
      NOW,
      90,
      'BAM',
      TODAY_ISO,
      true,
    );
    expect(events).toHaveLength(0);
  });

  it('falls back to last_seen + period when next_expected is null', async () => {
    const recurring: RecurringRow[] = [
      {
        id: 'r1',
        description: 'X',
        period: 'monthly',
        average_amount_cents: -1500,
        currency: 'BAM',
        next_expected_date: null,
        last_seen_date: '2026-04-01',
        paused_until: null,
        active: true,
      },
    ];
    // Anchor = last_seen + monthly = 2026-05-01. 90 days from 04-15 → 3 hits.
    const events = await generateRecurringEvents(recurring, NOW, 90, 'BAM', TODAY_ISO, true);
    expect(events).toHaveLength(3);
  });

  it('weekly cadence emits ~13 events in 90 days', async () => {
    const recurring: RecurringRow[] = [
      {
        id: 'r1',
        description: 'Coffee',
        period: 'weekly',
        average_amount_cents: -700,
        currency: 'BAM',
        next_expected_date: '2026-04-22',
        last_seen_date: null,
        paused_until: null,
        active: true,
      },
    ];
    const events = await generateRecurringEvents(recurring, NOW, 90, 'BAM', TODAY_ISO, true);
    // From 04-22 every 7 days through 07-14: 13 events.
    expect(events.length).toBeGreaterThanOrEqual(12);
    expect(events.length).toBeLessThanOrEqual(13);
  });
});

describe('generateInstallmentEvents', () => {
  it('emits one event per remaining installment', async () => {
    const installments: InstallmentRow[] = [
      {
        id: 'ip1',
        notes: 'Mobitel',
        account_id: 'a-1',
        currency: 'BAM',
        installment_count: 4,
        installment_cents: 50000,
        start_date: '2026-04-20',
        day_of_month: 20,
        status: 'active',
        posted_count: 0,
      },
    ];
    // 90 days from 04-15 → through 07-14. Installments due at 04-20,
    // 05-20, 06-20, 07-20 (last one is past horizon).
    const events = await generateInstallmentEvents(installments, NOW, 90, 'BAM', TODAY_ISO, true);
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.type).toBe('installment');
      expect(e.amountCents).toBe(-50000n);
      expect(e.sourceId).toBe('ip1');
    }
  });

  it('skips already-posted installments via posted_count', async () => {
    const events = await generateInstallmentEvents(
      [
        {
          id: 'ip1',
          notes: 'Mobitel',
          account_id: 'a-1',
          currency: 'BAM',
          installment_count: 4,
          installment_cents: 50000,
          start_date: '2026-04-20',
          day_of_month: 20,
          status: 'active',
          posted_count: 2,
        },
      ],
      NOW,
      90,
      'BAM',
      TODAY_ISO,
      true,
    );
    // Only installments 3 and 4; the second is past horizon → 1 event.
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('skips inactive plans (status != active)', async () => {
    const events = await generateInstallmentEvents(
      [
        {
          id: 'ip1',
          notes: 'X',
          account_id: 'a-1',
          currency: 'BAM',
          installment_count: 4,
          installment_cents: 50000,
          start_date: '2026-04-20',
          day_of_month: 20,
          status: 'cancelled',
        },
      ],
      NOW,
      90,
      'BAM',
      TODAY_ISO,
      true,
    );
    expect(events).toHaveLength(0);
  });
});

// ─── Projection ─────────────────────────────────────────────────────────────

describe('projectDayByDay', () => {
  it('produces a day-by-day series of length daysAhead', () => {
    const days = projectDayByDay(100_000n, NOW, 30, [], { outflowCents: 0n, inflowCents: 0n });
    expect(days).toHaveLength(30);
    // No baseline, no events → balance is flat.
    expect(days[0].balanceCents).toBe(100_000n);
    expect(days[29].balanceCents).toBe(100_000n);
  });

  it('subtracts baseline outflow each day', () => {
    const days = projectDayByDay(10_000n, NOW, 10, [], { outflowCents: 100n, inflowCents: 0n });
    // Each day balance drops by 100.
    expect(days[0].balanceCents).toBe(9_900n);
    expect(days[9].balanceCents).toBe(9_000n);
  });

  it('preserves event dates across the bucket-and-clear cycle', async () => {
    // Run the generator first so the internal date map is populated, then
    // run the projector — proves the bucketing pipeline works.
    const events = await generateRecurringEvents(
      [
        {
          id: 'r1',
          description: 'Netflix',
          period: 'monthly',
          average_amount_cents: -1500,
          currency: 'BAM',
          next_expected_date: format(addDays(NOW, 5), 'yyyy-MM-dd'),
          last_seen_date: null,
          paused_until: null,
          active: true,
        },
      ],
      NOW,
      30,
      'BAM',
      TODAY_ISO,
      true,
    );

    const days = projectDayByDay(10_000n, NOW, 30, events, { outflowCents: 0n, inflowCents: 0n });
    // Balance should drop on the 5th day after today (events index = 4 since
    // projection starts at today+1).
    const day5 = days[4];
    expect(day5.balanceCents).toBe(8_500n);
    expect(day5.events.find((e) => e.type === 'recurring')).toBeTruthy();
  });
});

// ─── End-to-end forecast ────────────────────────────────────────────────────

interface ChainResult<T> {
  data: T;
  error: null;
}

function fluent<T>(terminal: ChainResult<T>) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    gte: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainResult<T>) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

function makeSupabase(opts: {
  accounts?: AccountRow[];
  recurring?: RecurringRow[];
  installments?: InstallmentRow[];
  history?: {
    transaction_date: string;
    base_amount_cents: number;
    category_id?: string | null;
    /** Optional — defaults to the first account in `accounts` if any. */
    account_id?: string;
  }[];
  openingBalanceCategoryId?: string | null;
}) {
  const accounts = opts.accounts ?? [];
  const recurring = opts.recurring ?? [];
  const installments = opts.installments ?? [];
  const obCatId = opts.openingBalanceCategoryId ?? null;
  // Tests that don't bother specifying account_id on history rows are
  // implicitly using the first spending-type account so the rows still
  // pass the SPENDING_ACCOUNT_TYPES filter inside forecastCashflow.
  const SPENDING = ['checking', 'cash', 'credit_card', 'revolut', 'wise', 'other'];
  const defaultAcctId = accounts.find((a) => SPENDING.includes(a.type))?.id ?? 'default-acct';
  const history = (opts.history ?? []).map((h) => ({
    ...h,
    account_id: h.account_id ?? defaultAcctId,
  }));

  const fromMock = vi.fn((table: string) => {
    if (table === 'accounts') return fluent({ data: accounts, error: null });
    if (table === 'recurring_transactions') return fluent({ data: recurring, error: null });
    if (table === 'installment_plans') return fluent({ data: installments, error: null });
    if (table === 'transactions') return fluent({ data: history, error: null });
    if (table === 'categories') {
      return fluent({ data: obCatId ? { id: obCatId } : null, error: null });
    }
    throw new Error(`Unmocked table: ${table}`);
  });
  return { from: fromMock as never };
}

const ACCOUNT_DEFAULTS: Pick<AccountRow, 'is_active' | 'include_in_net_worth' | 'deleted_at'> = {
  is_active: true,
  include_in_net_worth: true,
  deleted_at: null,
};

describe('forecastCashflow (end-to-end)', () => {
  it('aggregates start balance only from spending account types (excludes savings, loan, investment)', async () => {
    const accounts: AccountRow[] = [
      {
        id: 'a1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 5000,
        ...ACCOUNT_DEFAULTS,
      },
      { id: 'a2', type: 'cash', currency: 'BAM', current_balance_cents: 1000, ...ACCOUNT_DEFAULTS },
      // Savings, loan, investment are out of scope — savings money is
      // saved (not spent), and the other two are modelled separately.
      {
        id: 'a3',
        type: 'savings',
        currency: 'BAM',
        current_balance_cents: 200_000,
        ...ACCOUNT_DEFAULTS,
      },
      {
        id: 'a4',
        type: 'loan',
        currency: 'BAM',
        current_balance_cents: -100_000,
        ...ACCOUNT_DEFAULTS,
      },
      {
        id: 'a5',
        type: 'investment',
        currency: 'BAM',
        current_balance_cents: 50_000,
        ...ACCOUNT_DEFAULTS,
      },
    ];
    const result = await forecastCashflow(makeSupabase({ accounts }), 'u-1', 30, {
      now: NOW,
      skipFx: true,
    });
    expect(result.startBalanceCents).toBe(6_000n);
  });

  it('skips deleted and inactive accounts', async () => {
    const accounts: AccountRow[] = [
      {
        id: 'a1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 1000,
        is_active: true,
        include_in_net_worth: true,
        deleted_at: null,
      },
      {
        id: 'a2',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 1000,
        is_active: false,
        include_in_net_worth: true,
        deleted_at: null,
      },
      {
        id: 'a3',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 1000,
        is_active: true,
        include_in_net_worth: true,
        deleted_at: '2026-01-01',
      },
    ];
    const result = await forecastCashflow(makeSupabase({ accounts }), 'u-1', 30, {
      now: NOW,
      skipFx: true,
    });
    expect(result.startBalanceCents).toBe(1_000n);
  });

  it('emits an "insufficient history" warning when activeDays < 30', async () => {
    const result = await forecastCashflow(
      makeSupabase({
        accounts: [
          {
            id: 'a1',
            type: 'checking',
            currency: 'BAM',
            current_balance_cents: 100_000,
            ...ACCOUNT_DEFAULTS,
          },
        ],
        history: Array.from({ length: 5 }, (_, i) => ({
          transaction_date: format(addDays(NOW, -i - 1), 'yyyy-MM-dd'),
          base_amount_cents: -100,
        })),
      }),
      'u-1',
      30,
      { now: NOW, skipFx: true },
    );
    expect(result.warnings.some((w) => w.includes('istorije'))).toBe(true);
  });

  it('clamps daysAhead to MAX_DAYS_AHEAD', async () => {
    const result = await forecastCashflow(makeSupabase({}), 'u-1', 99_999, {
      now: NOW,
      skipFx: true,
    });
    expect(result.daysAhead).toBeLessThanOrEqual(365);
  });

  it('clamps daysAhead to at least 1', async () => {
    const result = await forecastCashflow(makeSupabase({}), 'u-1', 0, {
      now: NOW,
      skipFx: true,
    });
    expect(result.daysAhead).toBe(1);
    expect(result.projections).toHaveLength(1);
  });

  it('detects negative-runway scenarios', async () => {
    // Tiny start balance + monthly subscription that hits hard.
    const result = await forecastCashflow(
      makeSupabase({
        accounts: [
          {
            id: 'a1',
            type: 'checking',
            currency: 'BAM',
            current_balance_cents: 1000,
            ...ACCOUNT_DEFAULTS,
          },
        ],
        recurring: [
          {
            id: 'r1',
            description: 'Big subscription',
            period: 'monthly',
            average_amount_cents: -5000,
            currency: 'BAM',
            next_expected_date: format(addDays(NOW, 3), 'yyyy-MM-dd'),
            last_seen_date: null,
            paused_until: null,
            active: true,
          },
        ],
      }),
      'u-1',
      30,
      { now: NOW, skipFx: true },
    );
    expect(result.runwayDays).not.toBeNull();
    expect(result.runwayDays).toBeGreaterThan(0);
    expect(result.lowestPoint).not.toBeNull();
    expect(result.lowestPoint?.balanceCents).toBeLessThan(0n);
  });

  it('returns null runway when balance stays positive', async () => {
    const result = await forecastCashflow(
      makeSupabase({
        accounts: [
          {
            id: 'a1',
            type: 'checking',
            currency: 'BAM',
            current_balance_cents: 1_000_000,
            ...ACCOUNT_DEFAULTS,
          },
        ],
      }),
      'u-1',
      30,
      { now: NOW, skipFx: true },
    );
    expect(result.runwayDays).toBeNull();
  });
});

// ─── Opening-balance exclusion ──────────────────────────────────────────────

describe('forecastCashflow (opening_balance baseline exclusion)', () => {
  it('drops opening_balance transactions from the baseline so a single large initial balance cannot dominate daily-spend signal', async () => {
    // Mirrors the regression: a user with a -150K loan opening_balance
    // entry and ~200 BAM/day of regular spend was getting a forecast
    // that plummeted by ~5K/day because the opening entry was averaged
    // into the 90d baseline.
    const obCatId = 'oc-1';
    const accounts: AccountRow[] = [
      {
        id: 'a1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 1_000_000,
        ...ACCOUNT_DEFAULTS,
      },
    ];
    // 30 days of small regular outflows + one giant negative opening_balance.
    const regularSpend = Array.from({ length: 30 }, (_, i) => ({
      transaction_date: format(addDays(NOW, -i - 1), 'yyyy-MM-dd'),
      base_amount_cents: -200,
      category_id: 'cat-groceries',
    }));
    const openingEntry = {
      transaction_date: format(addDays(NOW, -1), 'yyyy-MM-dd'),
      base_amount_cents: -15_000_000,
      category_id: obCatId,
    };

    const result = await forecastCashflow(
      makeSupabase({
        accounts,
        history: [...regularSpend, openingEntry],
        openingBalanceCategoryId: obCatId,
      }),
      'u-1',
      30,
      { now: NOW, skipFx: true },
    );

    // Without the exclusion the baseline outflow would be ~500K/day.
    // With it, average outflow per active day is ~200 cents.
    const day30 = result.projections[result.projections.length - 1];
    const drift = result.startBalanceCents - day30.balanceCents;
    expect(drift).toBeLessThan(20_000n);
    expect(result.runwayDays).toBeNull();
  });

  it('still works when the user has no opening_balance category yet', async () => {
    const result = await forecastCashflow(
      makeSupabase({
        accounts: [
          {
            id: 'a1',
            type: 'checking',
            currency: 'BAM',
            current_balance_cents: 50_000,
            ...ACCOUNT_DEFAULTS,
          },
        ],
        history: [
          {
            transaction_date: format(addDays(NOW, -1), 'yyyy-MM-dd'),
            base_amount_cents: -1_000,
            category_id: null,
          },
        ],
        // No category id means the `categories` lookup returns null
        // (maybeSingle), and every history row should be retained.
        openingBalanceCategoryId: null,
      }),
      'u-1',
      30,
      { now: NOW, skipFx: true },
    );

    expect(result.startBalanceCents).toBe(50_000n);
    expect(result.projections).toHaveLength(30);
  });
});

// ─── Spending-account scope (savings/loan/investment exclusion) ─────────────

describe('forecastCashflow (savings/loan baseline exclusion)', () => {
  it('drops history rows booked on a savings account from the baseline', async () => {
    // Salary lands on savings; daily groceries on checking. Without the
    // filter the salary would inflate dailyInflow even though that money
    // isn't being spent.
    const accounts: AccountRow[] = [
      {
        id: 'checking-1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 100_000,
        ...ACCOUNT_DEFAULTS,
      },
      {
        id: 'savings-1',
        type: 'savings',
        currency: 'BAM',
        current_balance_cents: 500_000,
        ...ACCOUNT_DEFAULTS,
      },
    ];

    const history = [
      // 30 days of small spending on checking (-100 each)
      ...Array.from({ length: 30 }, (_, i) => ({
        transaction_date: format(addDays(NOW, -i - 1), 'yyyy-MM-dd'),
        base_amount_cents: -100,
        account_id: 'checking-1',
      })),
      // One huge salary deposit on savings — should be ignored.
      {
        transaction_date: format(addDays(NOW, -1), 'yyyy-MM-dd'),
        base_amount_cents: 200_000,
        account_id: 'savings-1',
      },
    ];

    const result = await forecastCashflow(makeSupabase({ accounts, history }), 'u-1', 30, {
      now: NOW,
      skipFx: true,
    });

    // Start balance reflects only the spending account (no savings).
    expect(result.startBalanceCents).toBe(100_000n);
    // Day-30 should be roughly start - 30 * 100 = 97_000n. If the
    // salary had leaked in, dailyInflow would be ~6_667/day and the
    // forecast would actually grow — guard against that with a tight
    // upper bound + a sane lower bound.
    const day30 = result.projections[result.projections.length - 1];
    expect(day30.balanceCents).toBeGreaterThanOrEqual(95_000n);
    expect(day30.balanceCents).toBeLessThanOrEqual(100_000n);
  });

  it('drops history rows booked on loan/investment accounts from the baseline', async () => {
    const accounts: AccountRow[] = [
      {
        id: 'checking-1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 50_000,
        ...ACCOUNT_DEFAULTS,
      },
      {
        id: 'loan-1',
        type: 'loan',
        currency: 'BAM',
        current_balance_cents: -1_000_000,
        ...ACCOUNT_DEFAULTS,
      },
    ];
    const history = [
      // Manual loan principal posting on the loan account — must NOT
      // count toward baseline daily flow.
      {
        transaction_date: format(addDays(NOW, -5), 'yyyy-MM-dd'),
        base_amount_cents: -50_000,
        account_id: 'loan-1',
      },
    ];
    const result = await forecastCashflow(makeSupabase({ accounts, history }), 'u-1', 30, {
      now: NOW,
      skipFx: true,
    });
    // Only the checking account is in scope; the lone loan tx is
    // filtered, so baseline outflow is 0 and balance stays flat.
    expect(result.startBalanceCents).toBe(50_000n);
    const day30 = result.projections[result.projections.length - 1];
    expect(day30.balanceCents).toBe(50_000n);
  });
});

// ─── Performance ────────────────────────────────────────────────────────────

describe('forecastCashflow (performance)', () => {
  it('completes within 500ms for 50 recurring + 30 installments + 5000 history tx', async () => {
    const accounts: AccountRow[] = [
      {
        id: 'a1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 200_000,
        ...ACCOUNT_DEFAULTS,
      },
    ];
    const recurring: RecurringRow[] = Array.from({ length: 50 }, (_, i) => ({
      id: `r-${String(i)}`,
      description: `Sub ${String(i)}`,
      period: i % 2 === 0 ? 'monthly' : 'weekly',
      average_amount_cents: -(100 + i * 10),
      currency: 'BAM',
      next_expected_date: format(addDays(NOW, (i % 30) + 1), 'yyyy-MM-dd'),
      last_seen_date: null,
      paused_until: null,
      active: true,
    }));
    const installments: InstallmentRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `ip-${String(i)}`,
      notes: `Plan ${String(i)}`,
      account_id: 'a1',
      currency: 'BAM',
      installment_count: 12,
      installment_cents: 5000,
      start_date: format(addDays(NOW, -30), 'yyyy-MM-dd'),
      day_of_month: (i % 28) + 1,
      status: 'active',
      posted_count: 1,
    }));
    const history = Array.from({ length: 5000 }, (_, i) => ({
      transaction_date: format(addDays(NOW, -(i % 90) - 1), 'yyyy-MM-dd'),
      base_amount_cents: -(50 + (i % 20)),
    }));

    const start = performance.now();
    const result = await forecastCashflow(
      makeSupabase({ accounts, recurring, installments, history }),
      'u-1',
      90,
      { now: NOW, skipFx: true },
    );
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(result.projections).toHaveLength(90);
  });
});
