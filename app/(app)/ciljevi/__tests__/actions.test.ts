import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addContribution, createGoal, deleteGoal, linkAccount, updateGoal } from '../actions';
import { AddContributionSchema, CreateGoalSchema, UpdateGoalSchema } from '@/lib/goals/validation';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));

interface ChainTerminal {
  data: unknown;
  error: (Error & { code?: string; message?: string }) | { code?: string; message: string } | null;
}

/**
 * Minimal chainable PostgREST mock — same pattern as `budzeti/actions.test.ts`.
 * `.maybeSingle()` / `.single()` resolve to the configured terminal.
 * The chain itself is also thenable so `await chain` works for
 * insert/update/delete without `.select()`.
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

// ─── UUID fixtures ────────────────────────────────────────────────────────────

const GOAL_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ACCOUNT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
// Zod v4 uuid pattern requires 3rd segment to start with [1-8] and
// 4th segment to start with [89abAB] (RFC 4122 variant).
const OTHER_UUID = 'c3d4e5f6-a7b8-4012-8def-123456789012';

// ─── Valid input fixtures ─────────────────────────────────────────────────────

const VALID_CREATE = {
  name: 'Ljetovanje 2027',
  target_amount_cents: '500000',
  currency: 'BAM',
};

const VALID_CREATE_WITH_ACCOUNT = {
  ...VALID_CREATE,
  account_id: ACCOUNT_ID,
};

// ─── Schema tests ─────────────────────────────────────────────────────────────

describe('CreateGoalSchema', () => {
  it('accepts minimal valid input (name + target + currency)', () => {
    expect(CreateGoalSchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('transforms target_amount_cents string → bigint', () => {
    const r = CreateGoalSchema.safeParse({ ...VALID_CREATE, target_amount_cents: '12345' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.target_amount_cents).toBe(12345n);
  });

  it('rejects target_amount_cents = 0', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, target_amount_cents: '0' }).success).toBe(
      false,
    );
  });

  it('rejects negative target_amount_cents', () => {
    expect(
      CreateGoalSchema.safeParse({ ...VALID_CREATE, target_amount_cents: '-100' }).success,
    ).toBe(false);
  });

  it('rejects empty name', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, name: '' }).success).toBe(false);
  });

  it('rejects name longer than 200 chars', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, name: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });

  it('accepts valid hex color', () => {
    const r = CreateGoalSchema.safeParse({ ...VALID_CREATE, color: '#22C55E' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.color).toBe('#22C55E');
  });

  it('rejects invalid hex color format', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, color: 'green' }).success).toBe(false);
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, color: '#GGG' }).success).toBe(false);
  });

  it('accepts null color', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, color: null }).success).toBe(true);
  });

  it('accepts valid ISO target_date', () => {
    const r = CreateGoalSchema.safeParse({ ...VALID_CREATE, target_date: '2027-12-31' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.target_date).toBe('2027-12-31');
  });

  it('rejects malformed target_date', () => {
    expect(CreateGoalSchema.safeParse({ ...VALID_CREATE, target_date: '31-12-2027' }).success).toBe(
      false,
    );
  });

  it('accepts missing target_date (optional)', () => {
    const r = CreateGoalSchema.safeParse(VALID_CREATE);
    expect(r.success).toBe(true);
  });
});

describe('AddContributionSchema', () => {
  it('accepts positive amount', () => {
    const r = AddContributionSchema.safeParse({ amount_cents: '10000' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount_cents).toBe(10000n);
  });

  it('rejects zero amount', () => {
    expect(AddContributionSchema.safeParse({ amount_cents: '0' }).success).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(AddContributionSchema.safeParse({ amount_cents: '-500' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(AddContributionSchema.safeParse({ amount_cents: '' }).success).toBe(false);
  });
});

describe('UpdateGoalSchema', () => {
  it('accepts empty patch', () => {
    expect(UpdateGoalSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial patch with amount', () => {
    const r = UpdateGoalSchema.safeParse({ target_amount_cents: '99999' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.target_amount_cents).toBe(99999n);
  });

  it('accepts active=false patch', () => {
    expect(UpdateGoalSchema.safeParse({ active: false }).success).toBe(true);
  });
});

// ─── createGoal ───────────────────────────────────────────────────────────────

describe('createGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    rpc.mockResolvedValue({ error: null });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await createGoal(VALID_CREATE)).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
    });
  });

  it('returns VALIDATION_ERROR for missing fields', async () => {
    const r = await createGoal({ name: 'Test' });
    expect(r.success).toBe(false);
    if (!r.success && r.error === 'VALIDATION_ERROR') {
      expect(r.details.target_amount_cents).toBeDefined();
    }
  });

  it('happy path (no account) → returns id and revalidates', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    const r = await createGoal(VALID_CREATE);
    // GL-1: success now carries recomputeFailed (false here — no account → no RPC).
    expect(r).toEqual({ success: true, data: { id: GOAL_ID }, recomputeFailed: false });
    expect(revalidatePath).toHaveBeenCalledWith('/ciljevi');
    expect(revalidatePath).toHaveBeenCalledWith('/pocetna');
  });

  it('happy path with account → verifies account ownership then recomputes', async () => {
    // Call 1: account ownership check → found
    from.mockImplementationOnce(() => fluent({ data: { id: ACCOUNT_ID }, error: null }));
    // Call 2: insert goal → returns new id
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    // rpc call: recompute
    rpc.mockResolvedValueOnce({ error: null });

    const r = await createGoal(VALID_CREATE_WITH_ACCOUNT);
    expect(r).toEqual({ success: true, data: { id: GOAL_ID }, recomputeFailed: false });
    expect(rpc).toHaveBeenCalledWith('recompute_goal_from_account', { p_goal_id: GOAL_ID });
  });

  it('returns ACCOUNT_NOT_FOUND when linked account does not belong to user', async () => {
    // Account ownership check → no row
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const r = await createGoal(VALID_CREATE_WITH_ACCOUNT);
    expect(r).toEqual({ success: false, error: 'ACCOUNT_NOT_FOUND' });
  });

  it('GL-1: recompute RPC failure is non-fatal but surfaces recomputeFailed=true', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: ACCOUNT_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    rpc.mockResolvedValueOnce({ error: { message: 'timeout' } });
    const r = await createGoal(VALID_CREATE_WITH_ACCOUNT);
    expect(r).toEqual({ success: true, data: { id: GOAL_ID }, recomputeFailed: true });
  });

  it('returns DATABASE_ERROR on insert failure', async () => {
    from.mockImplementationOnce(() =>
      fluent({ data: null, error: { code: '08006', message: 'connection failure' } }),
    );
    expect(await createGoal(VALID_CREATE)).toEqual({
      success: false,
      error: 'DATABASE_ERROR',
    });
  });
});

// ─── updateGoal ───────────────────────────────────────────────────────────────

describe('updateGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    rpc.mockResolvedValue({ error: null });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateGoal(GOAL_ID, { name: 'Nova' })).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
    });
  });

  it('returns VALIDATION_ERROR for malformed id', async () => {
    const r = await updateGoal('not-uuid', { name: 'Nova' });
    expect(r.success).toBe(false);
    if (!r.success && r.error === 'VALIDATION_ERROR') {
      expect(r.details).toBeDefined();
    }
  });

  it('returns NOT_FOUND when ownership pre-check finds nothing', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await updateGoal(GOAL_ID, { name: 'Nova' })).toEqual({
      success: false,
      error: 'NOT_FOUND',
    });
  });

  it('happy path: updates name successfully', async () => {
    // Pre-check: found (no account currently linked)
    from.mockImplementationOnce(() =>
      fluent({ data: { id: GOAL_ID, account_id: null }, error: null }),
    );
    // Update call
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));

    // GL-1: updateGoal success now carries recomputeFailed flag.
    expect(await updateGoal(GOAL_ID, { name: 'Novo ime' })).toEqual({
      success: true,
      recomputeFailed: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/ciljevi');
  });

  it('no-op patch (empty) returns success without hitting DB a second time', async () => {
    from.mockImplementationOnce(() =>
      fluent({ data: { id: GOAL_ID, account_id: null }, error: null }),
    );
    expect(await updateGoal(GOAL_ID, {})).toEqual({ success: true, recomputeFailed: false });
    // from should have been called only once (the ownership pre-check)
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('returns ACCOUNT_NOT_FOUND when new account_id not owned by user', async () => {
    // Goal pre-check: found
    from.mockImplementationOnce(() =>
      fluent({ data: { id: GOAL_ID, account_id: null }, error: null }),
    );
    // Account ownership check: not found
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await updateGoal(GOAL_ID, { account_id: OTHER_UUID })).toEqual({
      success: false,
      error: 'ACCOUNT_NOT_FOUND',
    });
  });

  it('calls recompute when goal already has account_id and something else changes', async () => {
    // Goal pre-check: has existing account
    from.mockImplementationOnce(() =>
      fluent({ data: { id: GOAL_ID, account_id: ACCOUNT_ID }, error: null }),
    );
    // Update
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    rpc.mockResolvedValueOnce({ error: null });

    await updateGoal(GOAL_ID, { name: 'Updated name' });
    expect(rpc).toHaveBeenCalledWith('recompute_goal_from_account', { p_goal_id: GOAL_ID });
  });
});

// ─── addContribution ─────────────────────────────────────────────────────────

describe('addContribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await addContribution(GOAL_ID, { amount_cents: '1000' })).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
    });
  });

  it('returns NOT_FOUND when ownership pre-check finds nothing', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await addContribution(GOAL_ID, { amount_cents: '1000' })).toEqual({
      success: false,
      error: 'NOT_FOUND',
    });
  });

  it('returns VALIDATION_ERROR for zero amount', async () => {
    const r = await addContribution(GOAL_ID, { amount_cents: '0' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('VALIDATION_ERROR');
  });

  it('happy path: increments and returns currentCents, justAchieved=false', async () => {
    // Pre-check: current=40000, target would be 50000, not yet achieved
    from.mockImplementationOnce(() =>
      fluent({
        data: { id: GOAL_ID, current_amount_cents: 40000, achieved_at: null },
        error: null,
      }),
    );
    // Update + select: returns new current=45000, still not achieved
    from.mockImplementationOnce(() =>
      fluent({
        data: { current_amount_cents: 45000, achieved_at: null },
        error: null,
      }),
    );

    const r = await addContribution(GOAL_ID, { amount_cents: '5000' });
    expect(r).toEqual({
      success: true,
      data: { currentCents: '45000', justAchieved: false },
    });
  });

  it('detects justAchieved=true when achieved_at transitions null → non-null', async () => {
    // Pre-check: current=490000, not yet achieved
    from.mockImplementationOnce(() =>
      fluent({
        data: { id: GOAL_ID, current_amount_cents: 490000, achieved_at: null },
        error: null,
      }),
    );
    // Update: DB trigger sets achieved_at
    from.mockImplementationOnce(() =>
      fluent({
        data: { current_amount_cents: 500000, achieved_at: '2026-06-15T10:00:00Z' },
        error: null,
      }),
    );

    const r = await addContribution(GOAL_ID, { amount_cents: '10000' });
    expect(r).toEqual({
      success: true,
      data: { currentCents: '500000', justAchieved: true },
    });
  });

  it('justAchieved=false when goal was already achieved before contribution', async () => {
    // Pre-check: already achieved
    from.mockImplementationOnce(() =>
      fluent({
        data: {
          id: GOAL_ID,
          current_amount_cents: 500000,
          achieved_at: '2026-06-01T00:00:00Z',
        },
        error: null,
      }),
    );
    // Update
    from.mockImplementationOnce(() =>
      fluent({
        data: {
          current_amount_cents: 510000,
          achieved_at: '2026-06-01T00:00:00Z',
        },
        error: null,
      }),
    );

    const r = await addContribution(GOAL_ID, { amount_cents: '10000' });
    expect(r).toEqual({
      success: true,
      data: { currentCents: '510000', justAchieved: false },
    });
  });

  it('returns DATABASE_ERROR on update failure', async () => {
    from.mockImplementationOnce(() =>
      fluent({ data: { id: GOAL_ID, current_amount_cents: 0, achieved_at: null }, error: null }),
    );
    from.mockImplementationOnce(() =>
      fluent({ data: null, error: { code: '08006', message: 'connection failure' } }),
    );
    expect(await addContribution(GOAL_ID, { amount_cents: '1000' })).toEqual({
      success: false,
      error: 'DATABASE_ERROR',
    });
  });
});

// ─── deleteGoal ───────────────────────────────────────────────────────────────

describe('deleteGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: ownership check passes, delete succeeds', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await deleteGoal(GOAL_ID)).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/ciljevi');
  });

  it('returns NOT_FOUND when ownership check returns null', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await deleteGoal(GOAL_ID)).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('returns VALIDATION_ERROR for malformed id', async () => {
    const r = await deleteGoal('not-uuid');
    expect(r.success).toBe(false);
    if (!r.success && r.error === 'VALIDATION_ERROR') {
      expect(r.details._root.length).toBeGreaterThan(0);
    }
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await deleteGoal(GOAL_ID)).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns DATABASE_ERROR on delete failure', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    from.mockImplementationOnce(() =>
      fluent({ data: null, error: { code: '08006', message: 'db error' } }),
    );
    expect(await deleteGoal(GOAL_ID)).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});

// ─── linkAccount ─────────────────────────────────────────────────────────────

describe('linkAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    rpc.mockResolvedValue({ error: null });
    from.mockReset();
  });

  it('happy path: links account and calls recompute RPC', async () => {
    // Goal ownership check
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    // Account ownership check
    from.mockImplementationOnce(() => fluent({ data: { id: ACCOUNT_ID }, error: null }));
    // Update goal.account_id
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));

    // GL-1: linkAccount success now carries recomputeFailed flag.
    expect(await linkAccount(GOAL_ID, { account_id: ACCOUNT_ID })).toEqual({
      success: true,
      recomputeFailed: false,
    });
    expect(rpc).toHaveBeenCalledWith('recompute_goal_from_account', { p_goal_id: GOAL_ID });
    expect(revalidatePath).toHaveBeenCalledWith('/ciljevi');
  });

  it('happy path: unlinks account (null) does NOT call recompute', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));

    expect(await linkAccount(GOAL_ID, { account_id: null })).toEqual({
      success: true,
      recomputeFailed: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when goal not owned by user', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await linkAccount(GOAL_ID, { account_id: ACCOUNT_ID })).toEqual({
      success: false,
      error: 'NOT_FOUND',
    });
  });

  it('returns ACCOUNT_NOT_FOUND when account not owned by user', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    expect(await linkAccount(GOAL_ID, { account_id: ACCOUNT_ID })).toEqual({
      success: false,
      error: 'ACCOUNT_NOT_FOUND',
    });
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await linkAccount(GOAL_ID, { account_id: ACCOUNT_ID })).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
    });
  });

  it('returns VALIDATION_ERROR for malformed goal id', async () => {
    const r = await linkAccount('bad-id', { account_id: ACCOUNT_ID });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('VALIDATION_ERROR');
  });

  it('GL-1: recompute RPC failure is non-fatal but surfaces recomputeFailed=true', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: GOAL_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: { id: ACCOUNT_ID }, error: null }));
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    rpc.mockResolvedValueOnce({ error: { message: 'rpc timeout' } });

    expect(await linkAccount(GOAL_ID, { account_id: ACCOUNT_ID })).toEqual({
      success: true,
      recomputeFailed: true,
    });
  });
});
