/**
 * RLS for public.invite_codes (F4-E2-T1).
 *
 * `invite_codes` has NO policies for `authenticated` or `anon` — it's
 * service-role only. Authenticated users still get a "valid"/"used"/etc.
 * preview through the SECURITY DEFINER `preview_invite_code` RPC (which
 * is granted to anon + authenticated), but they cannot read or mutate the
 * underlying rows directly.
 *
 * Coverage:
 *   1. Authenticated cannot SELECT any row (no policy).
 *   2. Authenticated cannot INSERT (no policy).
 *   3. Authenticated cannot UPDATE / DELETE (no policy → 0 rows affected).
 *   4. Anon (no auth) likewise cannot SELECT.
 *   5. preview_invite_code RPC is callable by anon + authenticated and
 *      returns the right status string.
 *
 * Service-role admin client is verified to bypass RLS during seed +
 * preview-status setup.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import {
  ANON_KEY,
  SUPABASE_URL,
  adminClient,
  assertEnv,
  createUser,
  signedInClient,
  SHOULD_RUN,
} from './helpers';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function mkCode(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

describe.skipIf(!SHOULD_RUN)('invite_codes RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId = '';
  let liveCode = '';
  let usedCode = '';
  let expiredCode = '';
  let liveCodeId = '';

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    const a = await createUser(admin, 'inv-a');
    userAId = a.id;
    clientA = await signedInClient(a.email);

    liveCode = mkCode();
    usedCode = mkCode();
    expiredCode = mkCode();

    // Seed a live code (used_at null, expires_at in the future).
    const live = await admin
      .from('invite_codes')
      .insert({ code: liveCode })
      .select('id')
      .single();
    if (live.error) throw live.error;
    liveCodeId = live.data.id;

    // Seed a used code.
    await admin
      .from('invite_codes')
      .insert({ code: usedCode, used_at: new Date().toISOString(), used_by: userAId });

    // Seed an expired code (expires_at in the past).
    await admin
      .from('invite_codes')
      .insert({ code: expiredCode, expires_at: new Date(Date.now() - 1000).toISOString() });
  }, 60_000);

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => undefined);
  });

  it('authenticated cannot SELECT (no policy)', async () => {
    const res = await clientA.from('invite_codes').select('code');
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it('authenticated cannot INSERT (no policy)', async () => {
    const ins = await clientA
      .from('invite_codes')
      .insert({ code: mkCode() });
    expect(ins.error).not.toBeNull();
    expect((ins.error?.message ?? '').toLowerCase()).toMatch(/row-level security|violates|denied/);
  });

  it('authenticated cannot UPDATE (no policy → 0 rows)', async () => {
    const upd = await clientA
      .from('invite_codes')
      .update({ notes: 'hijacked' })
      .eq('id', liveCodeId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it('authenticated cannot DELETE (no policy → 0 rows)', async () => {
    const del = await clientA
      .from('invite_codes')
      .delete()
      .eq('id', liveCodeId)
      .select('id');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);

    const check = await admin
      .from('invite_codes')
      .select('id')
      .eq('id', liveCodeId)
      .single();
    expect(check.error).toBeNull();
    expect(check.data?.id).toBe(liveCodeId);
  });

  it('anon cannot SELECT', async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const res = await anon.from('invite_codes').select('code');
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it("preview_invite_code returns 'valid' for live code (anon)", async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.rpc('preview_invite_code', { p_code: liveCode });
    expect(error).toBeNull();
    expect(data).toBe('valid');
  });

  it("preview_invite_code returns 'used' for used code", async () => {
    const { data } = await clientA.rpc('preview_invite_code', { p_code: usedCode });
    expect(data).toBe('used');
  });

  it("preview_invite_code returns 'expired' for expired code", async () => {
    const { data } = await clientA.rpc('preview_invite_code', { p_code: expiredCode });
    expect(data).toBe('expired');
  });

  it("preview_invite_code returns 'invalid' for unknown code", async () => {
    const { data } = await clientA.rpc('preview_invite_code', { p_code: 'NOPE2345' });
    expect(data).toBe('invalid');
  });

  it("preview_invite_code returns 'invalid' for malformed input (length != 8)", async () => {
    const { data } = await clientA.rpc('preview_invite_code', { p_code: 'AB' });
    expect(data).toBe('invalid');
  });
});
