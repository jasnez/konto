/**
 * MT-4: rate-limit RPC integration test.
 *
 * Verifies that `check_rate_limit_and_record` actually enforces the sliding
 * window at the DB layer (unit tests mock the RPC; this test hits real SQL).
 *
 * The test calls the RPC IMPORT_PARSE_MAX times and expects `true` for each,
 * then calls it once more and expects `false` (over limit).
 *
 * Run via: RUN_INTEGRATION_TESTS=1 pnpm test -- __tests__/rls/rate-limit-rpc.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import {
  SHOULD_RUN,
  adminClient,
  assertEnv,
  createUser,
  signedInClient,
} from './helpers';
import { IMPORT_PARSE_MAX, IMPORT_PARSE_WINDOW_SEC } from '@/lib/server/rate-limit';

describe.skipIf(!SHOULD_RUN)('MT-4: check_rate_limit_and_record RPC enforcement', () => {
  let admin: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let userId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const user = await createUser(admin, 'rl-rpc');
    userId = user.id;
    userClient = await signedInClient(user.email);
  });

  afterAll(async () => {
    await admin.from('rate_limits').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId);
  });

  it(`allows exactly ${String(IMPORT_PARSE_MAX)} parse calls in the window then blocks the next`, async () => {
    // Call the RPC IMPORT_PARSE_MAX times — each should return true.
    for (let i = 0; i < IMPORT_PARSE_MAX; i++) {
      const { data, error } = await (
        userClient.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<
          typeof userClient.rpc
        >
      )('check_rate_limit_and_record', {
        p_user_id: userId,
        p_action: 'parse',
        p_limit: IMPORT_PARSE_MAX,
        p_window_seconds: IMPORT_PARSE_WINDOW_SEC,
      });
      expect(error, `call ${String(i + 1)} should not error`).toBeNull();
      expect(data, `call ${String(i + 1)} should be allowed`).toBe(true);
    }

    // The next call (IMPORT_PARSE_MAX + 1) must be blocked.
    const { data: blocked, error: blockErr } = await (
      userClient.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<
        typeof userClient.rpc
      >
    )('check_rate_limit_and_record', {
      p_user_id: userId,
      p_action: 'parse',
      p_limit: IMPORT_PARSE_MAX,
      p_window_seconds: IMPORT_PARSE_WINDOW_SEC,
    });
    expect(blockErr).toBeNull();
    expect(blocked).toBe(false);
  });

  it('rejects a call where p_user_id does not match auth.uid()', async () => {
    const otherId = '00000000-0000-4000-8000-000000000001';
    const { error } = await (
      userClient.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<
        typeof userClient.rpc
      >
    )('check_rate_limit_and_record', {
      p_user_id: otherId,
      p_action: 'parse',
      p_limit: IMPORT_PARSE_MAX,
      p_window_seconds: IMPORT_PARSE_WINDOW_SEC,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/UNAUTHORIZED/u);
  });
});
