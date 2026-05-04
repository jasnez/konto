/**
 * RLS for public.deletion_cancel_tokens (F4-E1-T1).
 *
 * Service-role only — there are NO RLS policies for `authenticated` or
 * `anon`. The intent is that the cancel-deletion email flow runs through
 * a Server Action that uses the admin client, never directly from the
 * browser. We assert that:
 *
 *   - User A cannot SELECT any row (their own or others').
 *   - User A cannot INSERT a row.
 *   - User A cannot UPDATE / DELETE any row.
 *
 * The admin client is verified to bypass RLS (used to seed the row).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import {
  adminClient,
  assertEnv,
  createUser,
  signedInClient,
  SHOULD_RUN,
} from './helpers';

describe.skipIf(!SHOULD_RUN)('deletion_cancel_tokens RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId = '';
  // jti is a UUID column — use crypto.randomUUID() rather than a hand-built tag.
  const jti = crypto.randomUUID();
  const impostorJti = crypto.randomUUID();

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    const a = await createUser(admin, 'dct-a');
    userAId = a.id;
    clientA = await signedInClient(a.email);

    // Service role can write — verifies the admin path the production
    // code uses also works under tests.
    const seed = await admin.from('deletion_cancel_tokens').insert({
      jti,
      user_id: userAId,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    if (seed.error) throw seed.error;
  }, 60_000);

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => undefined);
  });

  it('authenticated cannot SELECT (no policy)', async () => {
    const res = await clientA.from('deletion_cancel_tokens').select('jti');
    // RLS without a SELECT policy returns empty — no policy = nothing visible.
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it('authenticated cannot INSERT (no policy)', async () => {
    const ins = await clientA.from('deletion_cancel_tokens').insert({
      jti: impostorJti,
      user_id: userAId,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(ins.error).not.toBeNull();
    expect((ins.error?.message ?? '').toLowerCase()).toMatch(/row-level security|violates|denied/);
  });

  it('authenticated cannot UPDATE (no policy → 0 rows)', async () => {
    const upd = await clientA
      .from('deletion_cancel_tokens')
      .update({ expires_at: new Date().toISOString() })
      .eq('jti', jti)
      .select('jti');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it('authenticated cannot DELETE (no policy → 0 rows)', async () => {
    const del = await clientA
      .from('deletion_cancel_tokens')
      .delete()
      .eq('jti', jti)
      .select('jti');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);

    const check = await admin
      .from('deletion_cancel_tokens')
      .select('jti')
      .eq('jti', jti)
      .single();
    expect(check.error).toBeNull();
    expect(check.data?.jti).toBe(jti);
  });
});
