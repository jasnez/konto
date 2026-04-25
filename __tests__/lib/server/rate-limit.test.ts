import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, IMPORT_PARSE_MAX, IMPORT_PARSE_WINDOW_SEC } from '@/lib/server/rate-limit';

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkRateLimit', () => {
  it('returns true when the RPC allows the action', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const ok = await checkRateLimit(
      supabase,
      USER_ID,
      'parse',
      IMPORT_PARSE_MAX,
      IMPORT_PARSE_WINDOW_SEC,
    );
    expect(ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('check_rate_limit_and_record', {
      p_user_id: USER_ID,
      p_action: 'parse',
      p_limit: IMPORT_PARSE_MAX,
      p_window_seconds: IMPORT_PARSE_WINDOW_SEC,
    });
  });

  it('returns false when the RPC returns false (limit exceeded)', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    const ok = await checkRateLimit(supabase, USER_ID, 'upload', 20, 86_400);
    expect(ok).toBe(false);
  });

  it('returns false when the RPC returns an error', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'err' } }),
    };
    const ok = await checkRateLimit(supabase, USER_ID, 'parse', 5, 600);
    expect(ok).toBe(false);
  });
});
