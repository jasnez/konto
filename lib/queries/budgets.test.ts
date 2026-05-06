import { describe, expect, it, vi } from 'vitest';
import {
  getBudgetById,
  listBudgetTransactionsForCurrentPeriod,
  listBudgetsWithSpent,
  type BudgetsSupabaseClient,
} from './budgets';

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

interface MaybeSingleChain {
  select: (s: string) => MaybeSingleChain;
  eq: (col: string, val: unknown) => MaybeSingleChain;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
}

function makeMaybeSingleClient(
  row: BudgetRowFixture | null,
  rpcResults: Record<string, number | string | bigint | null> = {},
  selectError: { message: string } | null = null,
): BudgetsSupabaseClient {
  const chain: MaybeSingleChain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: selectError }),
  };
  const fromMock = vi.fn(() => chain);
  const rpcMock = vi.fn((_fn: string, params: Record<string, unknown>) => {
    const id = params.p_budget_id as string;
    if (!Object.prototype.hasOwnProperty.call(rpcResults, id)) {
      return Promise.resolve({ data: 0, error: null });
    }
    return Promise.resolve({ data: rpcResults[id], error: null });
  });
  return { from: fromMock as never, rpc: rpcMock as never };
}

describe('getBudgetById', () => {
  it('returns mapped budget with spent from RPC', async () => {
    const supabase = makeMaybeSingleClient(
      {
        id: 'b1',
        amount_cents: 100000,
        currency: 'BAM',
        period: 'monthly',
        active: true,
        rollover: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        category: SAMPLE_CATEGORY,
      },
      { b1: 25000 },
    );

    const result = await getBudgetById(supabase, 'user-1', 'b1', {
      today: new Date('2026-04-15T12:00:00Z'),
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('b1');
    expect(result?.spentCents).toBe(25000n);
    expect(result?.progress).toBeCloseTo(0.25, 5);
    expect(result?.category.name).toBe('Hrana');
  });

  it('returns null when budget not found', async () => {
    const supabase = makeMaybeSingleClient(null);
    const result = await getBudgetById(supabase, 'user-1', 'missing');
    expect(result).toBeNull();
  });

  it('returns null on select error', async () => {
    const supabase = makeMaybeSingleClient(null, {}, { message: 'connection lost' });
    const result = await getBudgetById(supabase, 'user-1', 'b1');
    expect(result).toBeNull();
  });

  it('returns null when category join is missing', async () => {
    const supabase = makeMaybeSingleClient({
      id: 'orphan',
      amount_cents: 10000,
      currency: 'BAM',
      period: 'monthly',
      active: true,
      rollover: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: null,
    });
    const result = await getBudgetById(supabase, 'user-1', 'orphan');
    expect(result).toBeNull();
  });

  it('skips RPC and reports spent=0 for inactive budget', async () => {
    const supabase = makeMaybeSingleClient(
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
      { 'b-inactive': 999 },
    );
    const result = await getBudgetById(supabase, 'user-1', 'b-inactive');
    expect(result?.spentCents).toBe(0n);
    expect(result?.daysLeft).toBe(0);
  });
});

interface TxRowFixture {
  id: string;
  transaction_date: string;
  description: string | null;
  merchant_raw: string | null;
  original_amount_cents: number;
  original_currency: string;
}

interface TxQueryRecorder {
  filters: [string, ...unknown[]][];
}

interface TxQueryChain {
  select: (s: string) => TxQueryChain;
  eq: (col: string, val: unknown) => TxQueryChain;
  gte: (col: string, val: unknown) => TxQueryChain;
  lt: (col: string, val: unknown) => TxQueryChain;
  is: (col: string, val: unknown) => TxQueryChain;
  order: (col: string, opts?: unknown) => TxQueryChain;
  limit: (n: number) => Promise<{ data: TxRowFixture[]; error: { message: string } | null }>;
}

function makeTxClient(
  rows: TxRowFixture[],
  selectError: { message: string } | null = null,
): { client: BudgetsSupabaseClient; recorder: TxQueryRecorder } {
  const recorder: TxQueryRecorder = { filters: [] };
  const chain: TxQueryChain = {
    select: () => chain,
    eq: (col, val) => {
      recorder.filters.push(['eq', col, val]);
      return chain;
    },
    gte: (col, val) => {
      recorder.filters.push(['gte', col, val]);
      return chain;
    },
    lt: (col, val) => {
      recorder.filters.push(['lt', col, val]);
      return chain;
    },
    is: (col, val) => {
      recorder.filters.push(['is', col, val]);
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: selectError }),
  };
  const fromMock = vi.fn(() => chain);
  return {
    client: { from: fromMock as never, rpc: vi.fn() as never },
    recorder,
  };
}

describe('listBudgetTransactionsForCurrentPeriod', () => {
  it('returns mapped rows for an active monthly budget', async () => {
    const { client } = makeTxClient([
      {
        id: 'tx-1',
        transaction_date: '2026-04-10',
        description: 'Lidl',
        merchant_raw: 'LIDL BIH',
        original_amount_cents: -1500,
        original_currency: 'BAM',
      },
    ]);
    const result = await listBudgetTransactionsForCurrentPeriod(
      client,
      'user-1',
      { categoryId: 'cat-1', period: 'monthly', active: true },
      { today: new Date('2026-04-15T12:00:00Z') },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('tx-1');
    expect(result[0]?.description).toBe('Lidl');
    expect(result[0]?.originalAmountCents).toBe(-1500);
  });

  it('short-circuits to [] for inactive budgets without hitting the DB', async () => {
    const { client } = makeTxClient([
      {
        id: 'tx-shouldnt-be-returned',
        transaction_date: '2026-04-10',
        description: 'X',
        merchant_raw: null,
        original_amount_cents: -100,
        original_currency: 'BAM',
      },
    ]);
    const result = await listBudgetTransactionsForCurrentPeriod(client, 'user-1', {
      categoryId: 'cat-1',
      period: 'monthly',
      active: false,
    });
    expect(result).toEqual([]);
    // `from` should not have been called when short-circuiting.
    expect((client.from as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('uses [first-of-month, first-of-next-month) range for monthly', async () => {
    const { client, recorder } = makeTxClient([]);
    await listBudgetTransactionsForCurrentPeriod(
      client,
      'user-1',
      { categoryId: 'cat-1', period: 'monthly', active: true },
      { today: new Date('2026-04-15T12:00:00Z') },
    );
    const gte = recorder.filters.find(([m, c]) => m === 'gte' && c === 'transaction_date');
    const lt = recorder.filters.find(([m, c]) => m === 'lt' && c === 'transaction_date');
    expect(gte?.[2]).toBe('2026-04-01');
    expect(lt?.[2]).toBe('2026-05-01');
  });

  it('uses ISO week [Mon, +7d) range for weekly', async () => {
    const { client, recorder } = makeTxClient([]);
    // 2026-04-15 is a Wednesday; ISO week starts Mon 2026-04-13.
    await listBudgetTransactionsForCurrentPeriod(
      client,
      'user-1',
      { categoryId: 'cat-1', period: 'weekly', active: true },
      { today: new Date('2026-04-15T12:00:00Z') },
    );
    const gte = recorder.filters.find(([m, c]) => m === 'gte' && c === 'transaction_date');
    const lt = recorder.filters.find(([m, c]) => m === 'lt' && c === 'transaction_date');
    expect(gte?.[2]).toBe('2026-04-13');
    expect(lt?.[2]).toBe('2026-04-20');
  });

  it('handles Sunday correctly for weekly (still in same ISO week as Monday)', async () => {
    const { client, recorder } = makeTxClient([]);
    // 2026-04-19 is a Sunday → ISO week is still Mon 2026-04-13.
    await listBudgetTransactionsForCurrentPeriod(
      client,
      'user-1',
      { categoryId: 'cat-1', period: 'weekly', active: true },
      { today: new Date('2026-04-19T12:00:00Z') },
    );
    const gte = recorder.filters.find(([m, c]) => m === 'gte' && c === 'transaction_date');
    expect(gte?.[2]).toBe('2026-04-13');
  });

  it('applies all RPC-mirroring filters (category, excluded, transfer, deleted)', async () => {
    const { client, recorder } = makeTxClient([]);
    await listBudgetTransactionsForCurrentPeriod(
      client,
      'user-1',
      { categoryId: 'cat-42', period: 'monthly', active: true },
      { today: new Date('2026-04-15T12:00:00Z') },
    );
    const eqs = recorder.filters.filter(([m]) => m === 'eq');
    const iss = recorder.filters.filter(([m]) => m === 'is');
    expect(eqs).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(eqs).toContainEqual(['eq', 'category_id', 'cat-42']);
    expect(eqs).toContainEqual(['eq', 'is_excluded', false]);
    expect(eqs).toContainEqual(['eq', 'is_transfer', false]);
    expect(iss).toContainEqual(['is', 'deleted_at', null]);
  });

  it('returns [] on select error', async () => {
    const { client } = makeTxClient([], { message: 'fail' });
    const result = await listBudgetTransactionsForCurrentPeriod(client, 'user-1', {
      categoryId: 'cat-1',
      period: 'monthly',
      active: true,
    });
    expect(result).toEqual([]);
  });
});
