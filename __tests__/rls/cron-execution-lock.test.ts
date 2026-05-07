/**
 * Integration test for SE-11 cron replay protection.
 *
 * Migration `20260625120000_00068_cron_execution_lock.sql` introduces:
 *   - `public.cron_executions` (RLS enabled, NO policies — service-role
 *     / SECURITY DEFINER only)
 *   - `public.acquire_cron_lock(text, int)` — internal helper, NOT
 *     granted to anon/authenticated/service_role at the API surface
 *
 * Both Vercel Cron handlers (`/api/cron/insights-nightly` and
 * `/api/cron/post-due-installments`) call the lock RPC after Bearer auth.
 * On a second invocation within the configured window, they return 409
 * "Replay rejected" instead of doing work.
 *
 * What this spec asserts:
 *   1. `cron_executions` table denies SELECT to anon (RLS, no policies).
 *   2. `acquire_cron_lock` is NOT callable directly by anon (per-role
 *      revoke verified — same gotcha as SE-10).
 *   3. End-to-end: invoking the post-due-installments cron handler twice
 *      with a valid Bearer returns 200 + 409 (replay rejected).
 *   4. Manual ops unlock works (DELETE FROM cron_executions allows next
 *      acquisition).
 *
 * Gated on RUN_INTEGRATION_TESTS=1 + a running local Supabase stack.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { adminClient, ANON_KEY, assertEnv, SHOULD_RUN, SUPABASE_URL, SERVICE_KEY } from './helpers';
import { GET as postDueInstallmentsGet } from '@/app/api/cron/post-due-installments/route';

const CRON_SECRET = 'integration-test-cron-secret-se11';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/post-due-installments', {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe.skipIf(!SHOULD_RUN)('SE-11: cron execution lock', () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  beforeAll(async () => {
    assertEnv();

    process.env.CRON_SECRET = CRON_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

    admin = adminClient();
    anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Clear any prior lock rows so we start from a known empty state.
    const { error } = await admin.from('cron_executions').delete().neq('cron_name', '');
    if (error) throw error;
  }, 30_000);

  afterAll(async () => {
    // Cleanup so back-to-back test runs don't poison each other.
    await admin.from('cron_executions').delete().neq('cron_name', '');
  });

  it('cron_executions table denies SELECT to anon (RLS, no policies)', async () => {
    const res = await anon.from('cron_executions').select('cron_name').limit(1);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it('acquire_cron_lock is NOT callable by anon (no GRANT to anon)', async () => {
    const res = await (
      anon as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc('acquire_cron_lock', {
      p_cron_name: 'insights_nightly',
      p_min_interval_seconds: 3600,
    });
    expect(res.error).not.toBeNull();
    const msg = (res.error?.message ?? '').toLowerCase();
    expect(
      msg.includes('permission denied') ||
        msg.includes('not found') ||
        msg.includes('does not exist'),
    ).toBe(true);
  });

  it('first cron invocation returns 200, second within 22h returns 409 (replay rejected)', async () => {
    // First call — should acquire the lock and proceed (no pending
    // installments, so it returns posted=0 happily).
    const first = await postDueInstallmentsGet(makeRequest());
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { posted: number; failed: number };
    expect(firstBody.posted).toBe(0);
    expect(firstBody.failed).toBe(0);

    // Second call — same Bearer, but the lock should reject. Even if
    // CRON_SECRET leaks, an attacker can't replay within the 22h window.
    const second = await postDueInstallmentsGet(makeRequest());
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { error: string };
    expect(secondBody.error).toContain('Replay rejected');

    // Verify cron_executions has exactly one row for our cron, with a
    // recent last_run_at — the lock state matches what we expect.
    const { data: rows } = await admin
      .from('cron_executions')
      .select('cron_name, last_run_at')
      .eq('cron_name', 'post_due_installments');
    expect(rows?.length).toBe(1);
    const ageMs = Date.now() - new Date(rows?.[0]?.last_run_at ?? 0).getTime();
    expect(ageMs).toBeLessThan(60_000); // last_run_at within the last minute
  }, 30_000);

  it('manual ops unlock (DELETE row) allows next acquisition', async () => {
    // Lock should still be held from the previous test.
    const blocked = await postDueInstallmentsGet(makeRequest());
    expect(blocked.status).toBe(409);

    // Ops simulation: DELETE the lock row.
    const { error: delErr } = await admin
      .from('cron_executions')
      .delete()
      .eq('cron_name', 'post_due_installments');
    expect(delErr).toBeNull();

    // Next call should succeed again.
    const next = await postDueInstallmentsGet(makeRequest());
    expect(next.status).toBe(200);
  }, 30_000);
});
