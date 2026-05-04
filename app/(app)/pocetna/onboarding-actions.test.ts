import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// vi.stubEnv used to safely toggle NODE_ENV per-test (assigning to
// process.env.NODE_ENV directly is read-only in vitest's typings).
import {
  completeOnboarding,
  markOnboardingStep,
  resetOnboarding,
} from './onboarding-actions';

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
  error: { message: string; code?: string } | null;
}

function fluent(terminal: ChainTerminal) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainTerminal) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

// Track update payload for assertions.
let lastUpdatePayload: Record<string, unknown> | null = null;

function fluentCapturing(terminal: ChainTerminal) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    update: (payload: Record<string, unknown>) => {
      lastUpdatePayload = payload;
      return chain;
    },
    eq: () => chain,
    is: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainTerminal) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

describe('markOnboardingStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdatePayload = null;
  });

  it('rejects invalid step', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const r = await markOnboardingStep(99);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('VALIDATION_ERROR');
  });

  it('rejects when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await markOnboardingStep(1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });

  it('merges step into existing jsonb', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // SELECT current jsonb
    from.mockReturnValueOnce(
      fluent({ data: { onboarding_completed: { step1: true } }, error: null }),
    );
    // UPDATE — capture payload
    from.mockReturnValueOnce(fluentCapturing({ data: null, error: null }));

    const r = await markOnboardingStep(2);
    expect(r.success).toBe(true);
    expect(lastUpdatePayload).toEqual({
      onboarding_completed: { step1: true, step2: true },
    });
  });

  it('handles missing existing jsonb (creates fresh)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: { onboarding_completed: null }, error: null }));
    from.mockReturnValueOnce(fluentCapturing({ data: null, error: null }));

    const r = await markOnboardingStep(1);
    expect(r.success).toBe(true);
    expect(lastUpdatePayload).toEqual({
      onboarding_completed: { step1: true },
    });
  });

  it('returns DATABASE_ERROR when select fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(
      fluent({ data: null, error: { message: 'PG select error' } }),
    );
    const r = await markOnboardingStep(1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('DATABASE_ERROR');
  });

  it('returns DATABASE_ERROR when update fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluent({ data: { onboarding_completed: {} }, error: null }));
    from.mockReturnValueOnce(fluent({ data: null, error: { message: 'PG update error' } }));
    const r = await markOnboardingStep(1);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('DATABASE_ERROR');
  });
});

describe('completeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdatePayload = null;
  });

  it('rejects when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await completeOnboarding();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });

  it('default: sets only onboarding_completed_at', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluentCapturing({ data: null, error: null }));

    const r = await completeOnboarding();
    expect(r.success).toBe(true);
    expect(lastUpdatePayload).toHaveProperty('onboarding_completed_at');
    expect(lastUpdatePayload).not.toHaveProperty('onboarding_completed');
  });

  it('with markRemainingTrue: fills jsonb with all steps true', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluentCapturing({ data: null, error: null }));

    const r = await completeOnboarding({ markRemainingTrue: true });
    expect(r.success).toBe(true);
    expect(lastUpdatePayload?.onboarding_completed).toEqual({
      step1: true,
      step2: true,
      step3: true,
      step4: true,
    });
  });
});

describe('resetOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastUpdatePayload = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await resetOnboarding();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('FORBIDDEN');
  });

  it('clears both fields in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReturnValueOnce(fluentCapturing({ data: null, error: null }));

    const r = await resetOnboarding();
    expect(r.success).toBe(true);
    expect(lastUpdatePayload).toEqual({
      onboarding_completed_at: null,
      onboarding_completed: {},
    });
  });

  it('rejects when no session (dev)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await resetOnboarding();
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe('UNAUTHORIZED');
  });
});
