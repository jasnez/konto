// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { subscriptionPriceChangeDetector } from '../detectors/subscription-price-change';
import { freshIds, makeContext, makeRecurring, makeTx } from './fixtures';

describe('subscriptionPriceChangeDetector', () => {
  beforeEach(() => {
    freshIds();
  });

  const today = new Date('2026-05-04T12:00:00Z');

  it('emits warning when latest tx > 110% of recurring average', () => {
    const recurring = makeRecurring({
      id: 'rec-netflix',
      description: 'Netflix',
      averageAmountCents: 1500n,
      occurrences: 6,
    });
    const transactions = [
      makeTx({
        date: '2026-04-30',
        amountCents: -1800, // 1800 / 1500 = 1.2 → +20%
        recurringId: 'rec-netflix',
      }),
    ];
    const ctx = makeContext({ today, transactions, recurring: [recurring] });
    const out = subscriptionPriceChangeDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].dedupKey).toMatch(/^subscription_price_change:rec-netflix:tx-\d+$/);
  });

  it('skips when ratio < 1.10', () => {
    const recurring = makeRecurring({
      id: 'rec-netflix',
      description: 'Netflix',
      averageAmountCents: 1500n,
      occurrences: 6,
    });
    const transactions = [
      makeTx({ date: '2026-04-30', amountCents: -1600, recurringId: 'rec-netflix' }),
    ];
    const ctx = makeContext({ today, transactions, recurring: [recurring] });
    expect(subscriptionPriceChangeDetector.run(ctx)).toHaveLength(0);
  });

  it('skips recurrings with < 3 occurrences', () => {
    const recurring = makeRecurring({
      id: 'rec-baby',
      averageAmountCents: 1500n,
      occurrences: 2,
    });
    const transactions = [
      makeTx({ date: '2026-04-30', amountCents: -3000, recurringId: 'rec-baby' }),
    ];
    const ctx = makeContext({ today, transactions, recurring: [recurring] });
    expect(subscriptionPriceChangeDetector.run(ctx)).toHaveLength(0);
  });

  it('skips when latest tx is older than 60 days', () => {
    const recurring = makeRecurring({
      id: 'rec-netflix',
      averageAmountCents: 1500n,
      occurrences: 6,
    });
    const transactions = [
      makeTx({
        date: '2026-02-01', // ~92 days before today
        amountCents: -3000,
        recurringId: 'rec-netflix',
      }),
    ];
    const ctx = makeContext({ today, transactions, recurring: [recurring] });
    expect(subscriptionPriceChangeDetector.run(ctx)).toHaveLength(0);
  });

  it('uses absolute amounts (handles sign correctly)', () => {
    const recurring = makeRecurring({
      id: 'rec-spotify',
      averageAmountCents: 1000n,
      occurrences: 5,
    });
    const transactions = [
      // Expense → negative
      makeTx({ date: '2026-04-30', amountCents: -1300, recurringId: 'rec-spotify' }),
    ];
    const ctx = makeContext({ today, transactions, recurring: [recurring] });
    expect(subscriptionPriceChangeDetector.run(ctx)).toHaveLength(1);
  });
});
