import { describe, expect, it, vi } from 'vitest';
import { listBudgetsWithSpent, type BudgetsSupabaseClient } from './budgets';

/**
 * Unit tests for listBudgetsWithSpent. Integration of the underlying
 * get_current_period_spent RPC against the real Postgres function lives
 * in the SQL smoke runs; here we verify the TS mapping logic.
 */

interface BudgetRowFixture {
  id: string;
  amount_cents: number;
  currency: string;
  period: 'monthly' | 'weekly';
  active: boolean;
  rollover: boolean;
  created_at: string;
  updated_at: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
    kind: string;
  } | null;
}

function makeBudgetClient(
  rows: BudgetRowFixture[],
  rpcResults: Record<string, number | string | bigint | null> = {},
  selectError: { message: string } | null = null,
): BudgetsSupabaseClient {
  const queryChain = {
    select: () => queryChain,
    eq: () => queryChain,
    order: () => queryChain,
    then: (resolve: (v: { data: unknown; error: typeof selectError }) => void) => {
      resolve({ data: rows, error: selectError });
    },
  };

  const fromMock = vi.fn(() => queryChain);
  const rpcMock = vi.fn((_fn: string, params: Record<string, unknown>) => {
    const id = params.p_budget_id as string;
    if (!Object.prototype.hasOwnProperty.call(rpcResults, id)) {
      return Promise.resolve({ data: 0, error: null });
    }
    return Promise.resolve({ data: rpcResults[id], error: null });
  });

  return { from: fromMock as never, rpc: rpcMock as never };
}

const SAMPLE_CATEGORY = {
  id: 'cat-1',
  name: 'Hrana',
  slug: 'hrana',
  icon: '🍔',
  color: null,
  kind: 'expense',
};

describe('listBudgetsWithSpent', () => {
  it('returns empty list on select error', async () => {
    const supabase = makeBudgetClient([], {}, { message: 'connection lost' });
    const result = await listBudgetsWithSpent(supabase, 'user-1');
    expect(result).toEqual([]);
  });

  it('maps rows + per-budget spent correctly', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'b1',
          amount_cents: 50000,
          currency: 'BAM',
          period: 'monthly',
          active: true,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: SAMPLE_CATEGORY,
        },
      ],
      { b1: 12500 },
      null,
    );

    const result = await listBudgetsWithSpent(supabase, 'user-1', {
      today: new Date('2026-04-15T12:00:00Z'),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('b1');
    expect(result[0]?.amountCents).toBe(50000n);
    expect(result[0]?.spentCents).toBe(12500n);
    expect(result[0]?.progress).toBeCloseTo(0.25, 5);
    expect(result[0]?.category.name).toBe('Hrana');
  });

  it('skips RPC for inactive budgets and reports spent=0', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'b-inactive',
          amount_cents: 30000,
          currency: 'BAM',
          period: 'monthly',
          active: false,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: SAMPLE_CATEGORY,
        },
      ],
      // Even if RPC would return 999, helper short-circuits to 0.
      { 'b-inactive': 999 },
    );

    const result = await listBudgetsWithSpent(supabase, 'user-1', {
      today: new Date('2026-04-15T12:00:00Z'),
    });

    expect(result[0]?.spentCents).toBe(0n);
    expect(result[0]?.daysLeft).toBe(0);
  });

  it('drops rows where category is null (orphaned join)', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'orphan',
          amount_cents: 10000,
          currency: 'BAM',
          period: 'monthly',
          active: true,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: null,
        },
      ],
      {},
    );
    const result = await listBudgetsWithSpent(supabase, 'user-1');
    expect(result).toEqual([]);
  });

  it('computes daysLeft for monthly period (mid-April → ~15 days)', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'b-monthly',
          amount_cents: 10000,
          currency: 'BAM',
          period: 'monthly',
          active: true,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: SAMPLE_CATEGORY,
        },
      ],
      { 'b-monthly': 0 },
    );
    const result = await listBudgetsWithSpent(supabase, 'user-1', {
      today: new Date('2026-04-15T12:00:00Z'),
    });
    // April has 30 days; from Apr 15 to Apr 30 = ~15 days.
    expect(result[0]?.daysLeft).toBeGreaterThanOrEqual(14);
    expect(result[0]?.daysLeft).toBeLessThanOrEqual(15);
  });

  it('computes daysLeft for weekly period (Wednesday → 4 days until Sunday)', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'b-weekly',
          amount_cents: 10000,
          currency: 'BAM',
          period: 'weekly',
          active: true,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: SAMPLE_CATEGORY,
        },
      ],
      { 'b-weekly': 0 },
    );
    // 2026-04-15 was a Wednesday (day index 3 in JS, ISO 3).
    const result = await listBudgetsWithSpent(supabase, 'user-1', {
      today: new Date('2026-04-15T12:00:00Z'),
    });
    expect(result[0]?.daysLeft).toBe(4); // Thu/Fri/Sat/Sun
  });

  it('does not crash when RPC returns null (defensive)', async () => {
    const supabase = makeBudgetClient(
      [
        {
          id: 'b-rpc-null',
          amount_cents: 10000,
          currency: 'BAM',
          period: 'monthly',
          active: true,
          rollover: false,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          category: SAMPLE_CATEGORY,
        },
      ],
      { 'b-rpc-null': null },
    );
    const result = await listBudgetsWithSpent(supabase, 'user-1');
    expect(result[0]?.spentCents).toBe(0n);
  });
});
