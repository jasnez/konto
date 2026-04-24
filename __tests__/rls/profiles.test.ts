/**
 * RLS for public.profiles.
 *
 * Profiles are seeded by `handle_new_user` on sign-up. Each user has exactly
 * one profile (id = auth.users.id). Cross-user isolation is the whole point.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

describe.skipIf(!SHOULD_RUN)('profiles RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, 'prof-a');
    const b = await createUser(admin, 'prof-b');
    userAId = a.id;
    userBId = b.id;

    clientA = await signedInClient(a.email);
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('A can read their own profile', async () => {
    const res = await clientA
      .from('profiles')
      .select('id, base_currency')
      .eq('id', userAId)
      .single();
    expect(res.error).toBeNull();
    expect(res.data?.id).toBe(userAId);
  });

  it("A cannot SELECT B's profile", async () => {
    const res = await clientA.from('profiles').select('id').eq('id', userBId);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("A cannot UPDATE B's profile", async () => {
    const upd = await clientA
      .from('profiles')
      .update({ display_name: 'hijacked' })
      .eq('id', userBId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it('A can UPDATE their own profile', async () => {
    const upd = await clientA
      .from('profiles')
      .update({ display_name: 'A renamed' })
      .eq('id', userAId)
      .select('id, display_name')
      .single();
    expect(upd.error).toBeNull();
    expect(upd.data?.display_name).toBe('A renamed');
  });

  it("A cannot INSERT a profile row with id = B's id", async () => {
    const ins = await clientA.from('profiles').insert({ id: userBId, display_name: 'impostor' });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.message.toLowerCase()).toMatch(/row-level security|violates|duplicate/);
  });
});
