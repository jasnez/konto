// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { savingsOpportunityDetector } from '../detectors/savings-opportunity';
import { freshIds, makeContext, makeTx } from './fixtures';

describe('savingsOpportunityDetector', () => {
  beforeEach(() => {
    freshIds();
  });

  const today = new Date('2026-05-04T12:00:00Z');

  function buildBaseline(catId: string, perMonthCents: number) {
    return [
      makeTx({
        date: '2026-01-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
      makeTx({
        date: '2026-02-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
      makeTx({
        date: '2026-03-15',
        amountCents: -perMonthCents,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
    ];
  }

  it('emits info when last month is < 80% of trailing avg', () => {
    const catId = 'cat-restorani';
    const transactions = [
      ...buildBaseline(catId, 20000), // 200 KM/mo avg
      makeTx({
        date: '2026-04-10',
        amountCents: -10000, // 100 KM → 0.5× → ratio < 0.8
        categoryId: catId,
        categoryName: 'Restorani',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    const out = savingsOpportunityDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('info');
    expect(out[0].dedupKey).toBe(`savings_opportunity:${catId}:2026-04`);
  });

  it('emits info when last month is 0 KM (full saving)', () => {
    const catId = 'cat-restorani';
    const transactions = [
      ...buildBaseline(catId, 20000),
      // No April spend
    ];
    const ctx = makeContext({ today, transactions });
    const out = savingsOpportunityDetector.run(ctx);
    expect(out).toHaveLength(1);
  });

  it('skips when avg below 100 BAM (avoids trivial categories)', () => {
    const catId = 'cat-tiny';
    const transactions = [
      ...buildBaseline(catId, 5000), // 50 KM avg
      makeTx({
        date: '2026-04-10',
        amountCents: -1000,
        categoryId: catId,
        categoryName: 'Sitno',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(savingsOpportunityDetector.run(ctx)).toHaveLength(0);
  });

  it('skips when ratio >= 0.80', () => {
    const catId = 'cat-restorani';
    const transactions = [
      ...buildBaseline(catId, 20000),
      makeTx({
        date: '2026-04-10',
        amountCents: -16000, // 80% — boundary, skip
        categoryId: catId,
        categoryName: 'Restorani',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(savingsOpportunityDetector.run(ctx)).toHaveLength(0);
  });

  it('skips when fewer than 3 trailing months', () => {
    const catId = 'cat-restorani';
    const transactions = [
      makeTx({
        date: '2026-02-15',
        amountCents: -20000,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
      makeTx({
        date: '2026-03-15',
        amountCents: -20000,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
      makeTx({
        date: '2026-04-10',
        amountCents: -5000,
        categoryId: catId,
        categoryName: 'Restorani',
      }),
    ];
    const ctx = makeContext({ today, transactions });
    expect(savingsOpportunityDetector.run(ctx)).toHaveLength(0);
  });
});
