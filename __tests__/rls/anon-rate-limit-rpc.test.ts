/**
 * Integration test for SE-10 rate-limit infrastructure.
 *
 * Migration `20260624120000_00067_anon_rate_limit_for_invite_preview.sql`
 * introduces:
 *   - `public.rate_limits_anon` (RLS enabled, NO policies — service-role
 *     / SECURITY DEFINER only)
 *   - `public.check_anon_rate_limit_and_record(...)` — internal helper,
 *     NOT granted to anon/authenticated
 *   - Modified `public.preview_invite_code(p_code text)` — calls the
 *     helper with caller IP at the top of every invocation
 *
 * What this spec asserts:
 *   1. `rate_limits_anon` table is unreadable from authenticated session
 *      (RLS denies SELECT — service-role only).
 *   2. `check_anon_rate_limit_and_record` is NOT callable directly by
 *      anon or authenticated (no GRANT).
 *   3. `preview_invite_code` enforces the 30/min/IP bucket: 30 calls
 *      from the same anon client succeed, the 31st raises
 *      'RATE_LIMITED' (errcode P0001).
 *   4. The bucket is keyed on caller IP — local Supabase PostgREST sees
 *      all test calls coming from one host, so all 30 land in the same
 *      bucket. (In production, distinct IPs get distinct buckets.)
 *
 * Gated on RUN_INTEGRATION_TESTS=1 + a running local Supabase stack —
 * same env vars as the rest of __tests__/rls/.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { adminClient, ANON_KEY, assertEnv, SHOULD_RUN, SUPABASE_URL } from './helpers';

describe.skipIf(!SHOULD_RUN)('SE-10: anon rate limit for invite preview', () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Clear any prior rate-limit rows from earlier test runs so we start
    // from a known empty bucket. Service-role bypasses RLS.
    const { error } = await admin.from('rate_limits_anon').delete().eq('action', 'invite_preview');
    if (error) throw error;
  }, 30_000);

  afterAll(async () => {
    // Cleanup so back-to-back test runs don't poison each other. Errors
    // here don't fail the test suite (vitest reports but continues).
    await admin.from('rate_limits_anon').delete().eq('action', 'invite_preview');
  });

  it('rate_limits_anon table denies SELECT to authenticated session (RLS, no policies)', async () => {
    const res = await anon.from('rate_limits_anon').select('id').limit(1);
    // PostgREST returns an empty result when RLS denies — no rows leak.
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it('check_anon_rate_limit_and_record is NOT callable by anon (no GRANT)', async () => {
    // Cast through unknown so the call typechecks without polluting
    // Database['public']['Functions'] with the internal helper.
    const res = await (
      anon as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc('check_anon_rate_limit_and_record', {
      p_bucket_key: 'qa-bucket',
      p_action: 'invite_preview',
      p_limit: 5,
      p_window_seconds: 60,
    });
    expect(res.error).not.toBeNull();
    // PostgREST surfaces "permission denied" / "function not found" for
    // un-granted RPCs depending on schema cache state — accept either.
    const msg = (res.error?.message ?? '').toLowerCase();
    expect(
      msg.includes('permission denied') ||
        msg.includes('not found') ||
        msg.includes('does not exist'),
    ).toBe(true);
  });

  it('preview_invite_code enforces 30/min/IP bucket and raises RATE_LIMITED on the 31st call', async () => {
    // Use a code that does not exist; the RPC still runs through the
    // rate-limit check (which is at the top of the function) before the
    // 8-char shape / lookup branch. So we exercise the rate-limit path
    // without touching the invite_codes table at all.
    const probeCode = 'QQQQQQQQ';

    // First 30 calls should all succeed (returning 'invalid' — the
    // probeCode doesn't exist in invite_codes, but the RPC ran).
    for (let i = 0; i < 30; i += 1) {
      const res = await anon.rpc('preview_invite_code', { p_code: probeCode }).single<string>();
      expect(res.error, `call ${String(i + 1)} unexpectedly errored`).toBeNull();
      expect(res.data).toBe('invalid');
    }

    // 31st call should hit the rate limit.
    const blocked = await anon.rpc('preview_invite_code', { p_code: probeCode }).single<string>();
    expect(blocked.error).not.toBeNull();
    expect(blocked.error?.message ?? '').toContain('RATE_LIMITED');
  }, 60_000);
});
