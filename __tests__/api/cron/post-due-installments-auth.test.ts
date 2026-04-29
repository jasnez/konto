import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the route handler.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
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
import { createClient } from '@/lib/supabase/server';
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

  it('passes auth with correct bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret');

    // Mock supabase to return empty occurrences so the handler finishes quickly.
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    } as never);

    const res = await GET(makeRequest('Bearer correct-secret'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { posted: number; failed: number };
    expect(body.posted).toBe(0);
    expect(body.failed).toBe(0);
  });
});
