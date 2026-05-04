import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissInsight, regenerateInsights, undismissInsight } from './actions';

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

const adminFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: adminFrom,
    rpc: vi.fn(),
  })),
}));

const { generateInsights } = vi.hoisted(() => ({
  generateInsights: vi.fn(),
}));

vi.mock('@/lib/analytics/insights/engine', () => ({
  generateInsights,
}));

interface ChainTerminal {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function fluent(terminal: ChainTerminal) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    or: () => chain,
    gte: () => chain,
    lte: () => chain,
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

const VALID_UUID = 'b1f9c7e4-3f1a-4d92-9c2e-aabbccddeeff';

describe('dismissInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns VALIDATION_ERROR for invalid UUID', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const r = await dismissInsight('not-a-uuid');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('VALIDATION_ERROR');
  });

  it('returns UNAUTHORIZED when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await dismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });

  it('returns NOT_FOUND when insight does not belong to user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    const r = await dismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('NOT_FOUND');
  });

  it('updates dismissed_at on success', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // 1st call: ownership pre-check (select)
    from.mockReturnValueOnce(fluent({ data: { id: VALID_UUID }, error: null }));
    // 2nd call: update
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    const r = await dismissInsight(VALID_UUID);
    expect(r.success).toBe(true);
  });

  it('returns DATABASE_ERROR when select fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: null, error: { message: 'PG error' } }));
    const r = await dismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('DATABASE_ERROR');
  });
});

describe('regenerateInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNAUTHORIZED when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await regenerateInsights();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });

  it('returns RATE_LIMITED when recent insight is < 60s old', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // recent insight created 10 seconds ago
    from.mockReturnValueOnce(
      fluent({
        data: { created_at: new Date(Date.now() - 10_000).toISOString() },
        error: null,
      }),
    );
    const r = await regenerateInsights();
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toBe('RATE_LIMITED');
      if (r.error === 'RATE_LIMITED') {
        expect(r.retryAfterSeconds).toBeGreaterThan(0);
        expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
      }
    }
    expect(generateInsights).not.toHaveBeenCalled();
  });

  it('runs engine when no recent insight', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    generateInsights.mockResolvedValue({
      created: 3,
      skipped: 1,
      errored: 0,
      byDetector: {},
    });
    const r = await regenerateInsights();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.created).toBe(3);
    }
    expect(generateInsights).toHaveBeenCalledOnce();
  });

  it('runs engine when recent insight is older than cooldown', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(
      fluent({
        data: { created_at: new Date(Date.now() - 120_000).toISOString() },
        error: null,
      }),
    );
    generateInsights.mockResolvedValue({
      created: 0,
      skipped: 0,
      errored: 0,
      byDetector: {},
    });
    const r = await regenerateInsights();
    expect(r.success).toBe(true);
  });

  it('returns DATABASE_ERROR when engine throws', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    generateInsights.mockRejectedValue(new Error('boom'));
    const r = await regenerateInsights();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('DATABASE_ERROR');
  });
});

describe('undismissInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns VALIDATION_ERROR for invalid UUID', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const r = await undismissInsight('not-a-uuid');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('VALIDATION_ERROR');
  });

  it('returns UNAUTHORIZED when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await undismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });

  it('returns NOT_FOUND when insight does not belong to user', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    const r = await undismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('NOT_FOUND');
  });

  it('returns CONFLICT when unique partial index hit (PG 23505)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // ownership pre-check
    from.mockReturnValueOnce(fluent({ data: { id: VALID_UUID }, error: null }));
    // update — fails with unique violation
    from.mockReturnValueOnce(
      fluent({ data: null, error: { message: 'duplicate', code: '23505' } }),
    );
    const r = await undismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('CONFLICT');
  });

  it('returns DATABASE_ERROR for non-23505 update failure', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: { id: VALID_UUID }, error: null }));
    from.mockReturnValueOnce(
      fluent({ data: null, error: { message: 'boom', code: 'XX000' } }),
    );
    const r = await undismissInsight(VALID_UUID);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('DATABASE_ERROR');
  });

  it('clears dismissed_at on success', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: { id: VALID_UUID }, error: null }));
    from.mockReturnValueOnce(fluent({ data: null, error: null }));
    const r = await undismissInsight(VALID_UUID);
    expect(r.success).toBe(true);
  });
});
