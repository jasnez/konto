// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { dormantSubscriptionDetector } from '../detectors/dormant-subscription';
import { freshIds, makeContext, makeRecurring } from './fixtures';

describe('dormantSubscriptionDetector', () => {
  beforeEach(() => {
    freshIds();
  });

  const today = new Date('2026-05-04T12:00:00Z');

  it('flags monthly recurring last seen >45 days ago', () => {
    const recurring = makeRecurring({
      id: 'rec-netflix',
      period: 'monthly',
      lastSeenDate: '2026-03-01', // ~64 days
      occurrences: 6,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    const out = dormantSubscriptionDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('info');
    expect(out[0].dedupKey).toBe('dormant_subscription:rec-netflix');
  });

  it('skips weekly recurrings still within window (last_seen 8 days ago)', () => {
    const recurring = makeRecurring({
      id: 'rec-news',
      period: 'weekly',
      lastSeenDate: '2026-04-26', // 8 days ago, threshold = 7×1.5=10
      occurrences: 6,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    expect(dormantSubscriptionDetector.run(ctx)).toHaveLength(0);
  });

  it('flags weekly recurring last seen >10 days ago', () => {
    const recurring = makeRecurring({
      id: 'rec-news',
      period: 'weekly',
      lastSeenDate: '2026-04-20', // 14 days ago
      occurrences: 5,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    expect(dormantSubscriptionDetector.run(ctx)).toHaveLength(1);
  });

  it('skips paused recurrings', () => {
    const recurring = makeRecurring({
      id: 'rec-paused',
      period: 'monthly',
      lastSeenDate: '2026-01-01',
      isPaused: true,
      occurrences: 8,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    expect(dormantSubscriptionDetector.run(ctx)).toHaveLength(0);
  });

  it('skips recurrings with < 3 occurrences (false-positive guard)', () => {
    const recurring = makeRecurring({
      id: 'rec-baby',
      period: 'monthly',
      lastSeenDate: '2026-01-01',
      occurrences: 2,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    expect(dormantSubscriptionDetector.run(ctx)).toHaveLength(0);
  });

  it('skips recurrings without lastSeenDate', () => {
    const recurring = makeRecurring({
      id: 'rec-fresh',
      period: 'monthly',
      lastSeenDate: null,
      occurrences: 6,
    });
    const ctx = makeContext({ today, recurring: [recurring] });
    expect(dormantSubscriptionDetector.run(ctx)).toHaveLength(0);
  });
});
