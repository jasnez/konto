// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryAnomalyDetector } from '../detectors/category-anomaly';
import { freshIds, makeContext, makeTx } from './fixtures';

describe('categoryAnomalyDetector', () => {
  beforeEach(() => {
    freshIds();
  });

  /**
   * "today" is 2026-05-04. Last full month is April 2026. The 3 trailing
   * months are January, February, March 2026.
   */
  const today = new Date('2026-05-04T12:00:00Z');

  function buildBaseline(catId: string, perMonthCents: number) {
    // 1 transaction per month at fixed amount, for the 3 trailing months.
    return [
      makeTx({
        date: '2026-01-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Hrana',
      }),
      makeTx({
        date: '2026-02-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Hrana',
      }),
      makeTx({
        date: '2026-03-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Hrana',
      }),
    ];
  }

  it('emits warning when last month is 130-180% of trailing avg', () => {
    const catId = 'cat-hrana';
    const transactions = [
      ...buildBaseline(catId, 10000), // 100 KM/mo avg
      makeTx({
        date: '2026-04-10',
        amountCents: -15000, // 150 KM in April → 1.5×
        categoryId: catId,
        categoryName: 'Hrana',
      }),
    ];

    const ctx = makeContext({ today, transactions });
    const out = categoryAnomalyDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].dedupKey).toBe(`category_anomaly:${catId}:2026-04`);
    expect(out[0].title).toContain('50%');
  });

  it('emits alert when ratio >= 1.80', () => {
    const catId = 'cat-hrana';
    const transactions = [
      ...buildBaseline(catId, 10000),
      makeTx({
        date: '2026-04-10',
        amountCents: -25000, // 250 KM → 2.5×
        categoryId: catId,
        categoryName: 'Hrana',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    const out = categoryAnomalyDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('alert');
  });

  it('skips when ratio < 1.30', () => {
    const catId = 'cat-hrana';
    const transactions = [
      ...buildBaseline(catId, 10000),
      makeTx({
        date: '2026-04-10',
        amountCents: -12000, // 120 KM → 1.2×
        categoryId: catId,
        categoryName: 'Hrana',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(categoryAnomalyDetector.run(ctx)).toHaveLength(0);
  });

  it('skips when fewer than 3 trailing months of data', () => {
    const catId = 'cat-hrana';
    const transactions = [
      makeTx({ date: '2026-02-15', amountCents: -10000, categoryId: catId, categoryName: 'Hrana' }),
      makeTx({ date: '2026-03-15', amountCents: -10000, categoryId: catId, categoryName: 'Hrana' }),
      makeTx({ date: '2026-04-15', amountCents: -25000, categoryId: catId, categoryName: 'Hrana' }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(categoryAnomalyDetector.run(ctx)).toHaveLength(0);
  });

  it('skips when trailing avg is below noise floor (50 BAM)', () => {
    const catId = 'cat-hrana';
    const transactions = [
      makeTx({ date: '2026-01-15', amountCents: -1000, categoryId: catId, categoryName: 'Hrana' }), // 10 KM
      makeTx({ date: '2026-02-15', amountCents: -1000, categoryId: catId, categoryName: 'Hrana' }),
      makeTx({ date: '2026-03-15', amountCents: -1000, categoryId: catId, categoryName: 'Hrana' }),
      makeTx({ date: '2026-04-10', amountCents: -5000, categoryId: catId, categoryName: 'Hrana' }), // 5× ratio
    ];
    const ctx = makeContext({ today, transactions });
    expect(categoryAnomalyDetector.run(ctx)).toHaveLength(0);
  });

  it('skips income / saving categories', () => {
    const catId = 'cat-plata';
    const transactions = [
      makeTx({
        date: '2026-01-15',
        amountCents: 100000,
        categoryId: catId,
        categoryName: 'Plata',
        categoryKind: 'income',
      }),
      makeTx({
        date: '2026-02-15',
        amountCents: 100000,
        categoryId: catId,
        categoryName: 'Plata',
        categoryKind: 'income',
      }),
      makeTx({
        date: '2026-03-15',
        amountCents: 100000,
        categoryId: catId,
        categoryName: 'Plata',
        categoryKind: 'income',
      }),
      makeTx({
        date: '2026-04-10',
        amountCents: 200000,
        categoryId: catId,
        categoryName: 'Plata',
        categoryKind: 'income',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(categoryAnomalyDetector.run(ctx)).toHaveLength(0);
  });
});
