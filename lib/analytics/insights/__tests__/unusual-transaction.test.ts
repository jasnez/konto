// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { unusualTransactionDetector } from '../detectors/unusual-transaction';
import { freshIds, makeContext, makeTx } from './fixtures';

describe('unusualTransactionDetector', () => {
  beforeEach(() => {
    freshIds();
  });

  const today = new Date('2026-05-04T12:00:00Z');

  /** 8 baseline txs at 5000 cents (50 KM); a 9th tx far above is the outlier. */
  function baselineWithOutlier(amountOutlier: number, txDate = '2026-05-01') {
    const baseline = [];
    for (let i = 0; i < 8; i += 1) {
      baseline.push(
        makeTx({
          date: `2026-04-${String(i + 1).padStart(2, '0')}`,
          amountCents: -5000, // 50 KM each
          categoryId: 'cat-shop',
          categoryName: 'Shopping',
        }),
      );
    }
    return [
      ...baseline,
      makeTx({
        date: txDate,
        amountCents: -amountOutlier,
        categoryId: 'cat-shop',
        categoryName: 'Shopping',
        merchantName: 'IKEA',
      }),
    ];
  }

  it('flags a tx > μ + 2σ as info', () => {
    // μ ≈ 5000, σ = 0 (all baseline equal). Need >0 σ. Add jitter:
    const transactions = [
      makeTx({ date: '2026-04-01', amountCents: -4500, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-02', amountCents: -5500, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-03', amountCents: -4800, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-04', amountCents: -5200, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-05', amountCents: -4700, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-06', amountCents: -5300, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-07', amountCents: -4900, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      makeTx({ date: '2026-04-08', amountCents: -5100, categoryId: 'cat-shop', categoryName: 'Shopping' }),
      // Outlier — way above 2σ
      makeTx({
        date: '2026-05-01',
        amountCents: -50000, // 500 KM, ~50 KM mean → wild z-score
        categoryId: 'cat-shop',
        categoryName: 'Shopping',
        merchantName: 'IKEA',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    const out = unusualTransactionDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(['info', 'warning']).toContain(out[0].severity);
    expect(out[0].dedupKey).toMatch(/^unusual_transaction:tx-\d{4}$/);
  });

  it('skips when category has < 8 baseline transactions', () => {
    const transactions = baselineWithOutlier(50000).slice(2); // only 7 rows
    const ctx = makeContext({ today, transactions });
    expect(unusualTransactionDetector.run(ctx)).toHaveLength(0);
  });

  it('skips outliers older than 14 days', () => {
    // Outlier dated 2026-04-15 (today is 2026-05-04 → ~19 days old)
    const transactions = baselineWithOutlier(50000, '2026-04-15');
    const ctx = makeContext({ today, transactions });
    expect(unusualTransactionDetector.run(ctx)).toHaveLength(0);
  });

  it('skips recurring-linked transactions', () => {
    const transactions = [
      makeTx({ date: '2026-04-01', amountCents: -4500, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-02', amountCents: -5500, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-03', amountCents: -4800, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-04', amountCents: -5200, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-05', amountCents: -4700, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-06', amountCents: -5300, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-07', amountCents: -4900, categoryId: 'cat-x', categoryKind: 'expense' }),
      makeTx({ date: '2026-04-08', amountCents: -5100, categoryId: 'cat-x', categoryKind: 'expense' }),
      // Outlier but linked to recurring
      makeTx({
        date: '2026-05-01',
        amountCents: -50000,
        categoryId: 'cat-x',
        categoryKind: 'expense',
        recurringId: 'rec-99',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(unusualTransactionDetector.run(ctx)).toHaveLength(0);
  });
});
