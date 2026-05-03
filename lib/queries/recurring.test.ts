// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  listActiveRecurring,
  monthlyEquivalentCents,
  totalMonthlyEquivalentCents,
  type ActiveRecurring,
  type RecurringSupabaseClient,
} from './recurring';

// ─── monthlyEquivalentCents (pure math) ─────────────────────────────────────

describe('monthlyEquivalentCents', () => {
  it('weekly: cents * 52 / 12', () => {
    expect(monthlyEquivalentCents(-1200n, 'weekly')).toBe(-5200n); // -1200*52/12
  });

  it('bi-weekly: cents * 26 / 12', () => {
    expect(monthlyEquivalentCents(-1200n, 'bi-weekly')).toBe(-2600n);
  });

  it('monthly: identity', () => {
    expect(monthlyEquivalentCents(-1500n, 'monthly')).toBe(-1500n);
  });

  it('quarterly: cents / 3', () => {
    expect(monthlyEquivalentCents(-9000n, 'quarterly')).toBe(-3000n);
  });

  it('yearly: cents / 12', () => {
    expect(monthlyEquivalentCents(-12000n, 'yearly')).toBe(-1000n);
  });

  it('preserves sign on positive amounts (future inflow expansion)', () => {
    expect(monthlyEquivalentCents(12000n, 'yearly')).toBe(1000n);
  });

  it('handles zero cleanly', () => {
    expect(monthlyEquivalentCents(0n, 'yearly')).toBe(0n);
  });
});

// ─── totalMonthlyEquivalentCents ────────────────────────────────────────────

const baseItem = (
  overrides: Partial<Pick<ActiveRecurring, 'averageAmountCents' | 'period' | 'isPaused'>>,
) => ({
  averageAmountCents: -1500n,
  period: 'monthly' as const,
  isPaused: false,
  ...overrides,
});

describe('totalMonthlyEquivalentCents', () => {
  it('sums monthly equivalents across mixed periods', () => {
    const items = [
      baseItem({ averageAmountCents: -1500n, period: 'monthly' }),
      baseItem({ averageAmountCents: -1200n, period: 'weekly' }), // -5200
      baseItem({ averageAmountCents: -12000n, period: 'yearly' }), // -1000
    ];
    expect(totalMonthlyEquivalentCents(items)).toBe(-1500n - 5200n - 1000n);
  });

  it('skips paused rows when skipPaused=true', () => {
    const items = [
      baseItem({ averageAmountCents: -1500n, period: 'monthly', isPaused: false }),
      baseItem({ averageAmountCents: -2000n, period: 'monthly', isPaused: true }),
    ];
    expect(totalMonthlyEquivalentCents(items, { skipPaused: true })).toBe(-1500n);
    expect(totalMonthlyEquivalentCents(items)).toBe(-3500n);
  });

  it('returns 0 for empty input', () => {
    expect(totalMonthlyEquivalentCents([])).toBe(0n);
  });
});

// ─── listActiveRecurring ────────────────────────────────────────────────────

interface RawRow {
  id: string;
  description: string;
  period: string;
  average_amount_cents: number;
  currency: string;
  next_expected_date: string | null;
  last_seen_date: string | null;
  paused_until: string | null;
  detection_confidence: number | string | null;
  occurrences: number;
  merchant_id: string | null;
  category_id: string | null;
  account_id: string | null;
  created_at: string;
  merchants: { display_name: string | null } | null;
  categories: { name: string | null } | null;
  accounts: { name: string | null } | null;
}

function makeClient(
  rows: RawRow[],
  error: { message: string } | null = null,
): RecurringSupabaseClient {
  const queryChain = {
    select: () => queryChain,
    eq: () => queryChain,
    order: () => queryChain,
    then: (resolve: (v: { data: unknown; error: typeof error }) => void) => {
      resolve({ data: rows, error });
    },
  };
  const fromMock = vi.fn(() => queryChain);
  const rpcMock = vi.fn();
  return { from: fromMock as never, rpc: rpcMock as never };
}

const SAMPLE_ROW: RawRow = {
  id: 'rec-1',
  description: 'Netflix',
  period: 'monthly',
  average_amount_cents: -1500,
  currency: 'BAM',
  next_expected_date: '2026-06-01',
  last_seen_date: '2026-05-01',
  paused_until: null,
  detection_confidence: '0.95',
  occurrences: 6,
  merchant_id: 'm-1',
  category_id: 'c-1',
  account_id: 'a-1',
  created_at: '2026-04-01T00:00:00Z',
  merchants: { display_name: 'Netflix Streaming' },
  categories: { name: 'Streaming' },
  accounts: { name: 'Glavni račun' },
};

describe('listActiveRecurring', () => {
  it('returns empty list on select error', async () => {
    const supabase = makeClient([], { message: 'connection lost' });
    const result = await listActiveRecurring(supabase, 'user-1');
    expect(result).toEqual([]);
  });

  it('maps rows incl. joined names and bigint amount', async () => {
    const supabase = makeClient([SAMPLE_ROW]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.id).toBe('rec-1');
    expect(item.averageAmountCents).toBe(-1500n);
    expect(item.merchantName).toBe('Netflix Streaming');
    expect(item.categoryName).toBe('Streaming');
    expect(item.accountName).toBe('Glavni račun');
    expect(item.detectionConfidence).toBeCloseTo(0.95);
  });

  it('marks isPaused when paused_until is in the future', async () => {
    const supabase = makeClient([{ ...SAMPLE_ROW, paused_until: '2099-12-31' }]);
    const [item] = await listActiveRecurring(supabase, 'user-1', {
      now: new Date('2026-04-15T12:00:00Z'),
    });
    expect(item.isPaused).toBe(true);
  });

  it('does NOT mark isPaused when paused_until is in the past', async () => {
    const supabase = makeClient([{ ...SAMPLE_ROW, paused_until: '2025-01-01' }]);
    const [item] = await listActiveRecurring(supabase, 'user-1', {
      now: new Date('2026-04-15T12:00:00Z'),
    });
    expect(item.isPaused).toBe(false);
  });

  it('handles null paused_until cleanly', async () => {
    const supabase = makeClient([SAMPLE_ROW]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.isPaused).toBe(false);
    expect(item.pausedUntil).toBeNull();
  });

  it('handles null joined relations', async () => {
    const supabase = makeClient([
      { ...SAMPLE_ROW, merchants: null, categories: null, accounts: null },
    ]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.merchantName).toBeNull();
    expect(item.categoryName).toBeNull();
    expect(item.accountName).toBeNull();
  });

  it('coerces unknown period to monthly defensively', async () => {
    const supabase = makeClient([{ ...SAMPLE_ROW, period: 'unknown-future-period' }]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.period).toBe('monthly');
  });

  it('coerces detection_confidence string → number', async () => {
    const supabase = makeClient([{ ...SAMPLE_ROW, detection_confidence: '0.65' }]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.detectionConfidence).toBeCloseTo(0.65);
  });

  it('handles null detection_confidence', async () => {
    const supabase = makeClient([{ ...SAMPLE_ROW, detection_confidence: null }]);
    const [item] = await listActiveRecurring(supabase, 'user-1');
    expect(item.detectionConfidence).toBeNull();
  });
});
