import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBudget, deleteBudget, toggleBudgetActive, updateBudget } from './actions';
import { CreateBudgetSchema, UpdateBudgetSchema } from '@/lib/budgets/validation';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    from,
  })),
}));

interface ChainTerminal {
  data: unknown;
  error: (Error & { code?: string; message?: string }) | { code?: string; message: string } | null;
}

/**
 * Minimal chainable PostgREST mock. `.maybeSingle()` / `.single()` resolve
 * to the configured terminal; everything else returns the same chain object.
 *
 * Some branches need the *terminal* itself to be the resolved value of the
 * outermost call (insert/update without `.select()`). The chain is also a
 * thenable so `await chain` works (resolves to the terminal directly).
 */
function fluent(terminal: ChainTerminal) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainTerminal) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

const VALID_INPUT = {
  category_id: 'b1f9c7e4-3f1a-4d92-9c2e-aabbccddeeff',
  amount_cents: '50000',
  currency: 'BAM',
  period: 'monthly' as const,
  rollover: false,
};

describe('CreateBudgetSchema', () => {
  it('accepts valid input', () => {
    const r = CreateBudgetSchema.safeParse(VALID_INPUT);
    expect(r.success).toBe(true);
  });

  it('rejects amount_cents = 0 (must be > 0)', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, amount_cents: '0' });
    expect(r.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, amount_cents: '-100' });
    expect(r.success).toBe(false);
  });

  it('rejects empty amount string', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, amount_cents: '' });
    expect(r.success).toBe(false);
  });

  it('rejects period other than monthly/weekly', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, period: 'daily' });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid category_id', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, category_id: 'not-uuid' });
    expect(r.success).toBe(false);
  });

  it('transforms amount_cents string → bigint on server schema', () => {
    const r = CreateBudgetSchema.safeParse({ ...VALID_INPUT, amount_cents: '12345' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount_cents).toBe(12345n);
    }
  });
});

describe('UpdateBudgetSchema', () => {
  it('accepts empty patch', () => {
    expect(UpdateBudgetSchema.safeParse({}).success).toBe(true);
  });
  it('accepts partial patch', () => {
    const r = UpdateBudgetSchema.safeParse({ amount_cents: '99999' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount_cents).toBe(99999n);
    }
  });
});

describe('createBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createBudget(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns VALIDATION_ERROR for missing fields', async () => {
    const result = await createBudget({ amount_cents: '50000' });
    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details.category_id).toBeDefined();
    }
  });

  it('happy path → returns id and revalidates', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }));

    const result = await createBudget(VALID_INPUT);
    expect(result).toEqual({ success: true, data: { id: 'budget-1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/budzeti');
    expect(revalidatePath).toHaveBeenCalledWith('/pocetna');
  });

  it('maps unique violation (23505) → DUPLICATE_ACTIVE', async () => {
    from.mockImplementationOnce(() =>
      fluent({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
    );
    const result = await createBudget(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'DUPLICATE_ACTIVE' });
  });

  it('maps RLS WITH CHECK failure (42501) → CATEGORY_NOT_BUDGETABLE', async () => {
    from.mockImplementationOnce(() =>
      fluent({
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security policy for table "budgets"',
        },
      }),
    );
    const result = await createBudget(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'CATEGORY_NOT_BUDGETABLE' });
  });

  it('falls back to DATABASE_ERROR for unknown PG codes', async () => {
    from.mockImplementationOnce(() =>
      fluent({
        data: null,
        error: { code: '08006', message: 'connection failure' },
      }),
    );
    const result = await createBudget(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});

describe('updateBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      amount_cents: '99999',
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns VALIDATION_ERROR for malformed id', async () => {
    const result = await updateBudget('not-uuid', {});
    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details).toBeDefined();
    }
  });

  it('returns NOT_FOUND when ownership pre-check finds nothing (cross-user id)', async () => {
    // First .from(): ownership select → null (no row owned by user)
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      amount_cents: '99999',
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('happy path: pre-check passes, update succeeds', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      amount_cents: '60000',
      rollover: true,
    });
    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/budzeti');
  });

  it('no-op patch (empty input) still returns success', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }));
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {});
    expect(result).toEqual({ success: true });
  });

  it('maps update unique violation → DUPLICATE_ACTIVE', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() =>
        fluent({
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        }),
      );
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      period: 'monthly',
    });
    expect(result).toEqual({ success: false, error: 'DUPLICATE_ACTIVE' });
  });

  it('maps RLS check failure on category_id change → CATEGORY_NOT_BUDGETABLE', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() =>
        fluent({
          data: null,
          error: {
            code: '42501',
            message: 'new row violates row-level security policy',
          },
        }),
      );
    const result = await updateBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      category_id: 'd3a8f5e7-4b2c-4d83-9e3c-aabbccddeeff',
    });
    expect(result).toEqual({ success: false, error: 'CATEGORY_NOT_BUDGETABLE' });
  });
});

describe('toggleBudgetActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: active=false → returns success', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await toggleBudgetActive('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      active: false,
    });
    expect(result).toEqual({ success: true });
  });

  it('returns NOT_FOUND when budget not owned', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await toggleBudgetActive('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      active: true,
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('reactivating into a duplicate slot → DUPLICATE_ACTIVE', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() =>
        fluent({ data: null, error: { code: '23505', message: 'duplicate' } }),
      );
    const result = await toggleBudgetActive('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      active: true,
    });
    expect(result).toEqual({ success: false, error: 'DUPLICATE_ACTIVE' });
  });

  it('rejects non-boolean active', async () => {
    const result = await toggleBudgetActive('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff', {
      active: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('deleteBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: select OK + delete OK → success', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: 'budget-1' }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await deleteBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff');
    expect(result).toEqual({ success: true });
  });

  it('NOT_FOUND when ownership pre-check empty', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await deleteBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff');
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('VALIDATION_ERROR for malformed id', async () => {
    const result = await deleteBudget('not-uuid');
    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details._root.length).toBeGreaterThan(0);
    }
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await deleteBudget('c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff');
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });
});
