import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the route handler.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/fx/convert', () => ({
  convertToBase: vi.fn(),
}));

vi.mock('@/lib/fx/account-ledger', () => ({
  computeAccountLedgerCents: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logSafe: vi.fn(),
}));

import { GET } from '@/app/api/cron/post-due-installments/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSafe } from '@/lib/logger';

function makeRequest(bearer?: string): Request {
  const headers = new Headers();
  if (bearer !== undefined) {
    headers.set('authorization', bearer);
  }
  return new Request('http://localhost/api/cron/post-due-installments', {
    method: 'GET',
    headers,
  });
}

describe('POST /api/cron/post-due-installments — auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns 500 when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const res = await GET(makeRequest('Bearer whatever'));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Server misconfiguration');
    expect(vi.mocked(logSafe)).toHaveBeenCalledWith('post_due_installments_missing_secret', {});
  });

  it('returns 401 when bearer token is wrong', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret');

    const res = await GET(makeRequest('Bearer wrong-secret'));

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Unauthorized');
  });

  it('uses createAdminClient (PR-1 regression guard) and returns 200 on auth success', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret');

    // Mock supabase to return empty occurrences so the handler finishes quickly.
    // createAdminClient is sync (returns SupabaseClient directly), unlike the
    // cookie-based createClient that this route used before PR-1 — a sync
    // mockReturnValue here is intentional and protects against accidental
    // re-introduction of the broken async pattern.
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    // SE-11: route also calls supabase.rpc('acquire_cron_lock', ...) before
    // the data fetch. Mock it to grant the lock so the handler proceeds to
    // the (empty) occurrences fetch and returns posted=0.
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never);

    const res = await GET(makeRequest('Bearer correct-secret'));

    expect(res.status).toBe(200);
    expect(vi.mocked(createAdminClient)).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { posted: number; failed: number };
    expect(body.posted).toBe(0);
    expect(body.failed).toBe(0);
  });

  it('returns 409 when acquire_cron_lock rejects (SE-11 replay protection)', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret');

    // SE-11 regression guard: even with a valid Bearer, if the lock RPC
    // returns false (replay rejected), the handler must return 409 and
    // NOT proceed to fetch occurrences. The from() mock is intentionally
    // set up to throw if called, so this test fails noisily if the lock
    // gate is ever bypassed.
    const fromMock = vi.fn(() => {
      throw new Error('SE-11 violation: from() called after lock rejected');
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never);

    const res = await GET(makeRequest('Bearer correct-secret'));

    expect(res.status).toBe(409);
    expect(fromMock).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Replay rejected');
    expect(vi.mocked(logSafe)).toHaveBeenCalledWith('post_due_installments_replay_rejected', {});
  });
});
