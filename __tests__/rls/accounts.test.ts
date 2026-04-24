/**
 * RLS for public.accounts.
 *
 *   1. User A can CRUD their own accounts.
 *   2. User A cannot SELECT user B's accounts (returns [], not an error).
 *   3. User A cannot UPDATE or DELETE user B's accounts (error or 0 rows).
 *   4. User A cannot INSERT an account with user_id = user B's id (policy denies).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

describe.skipIf(!SHOULD_RUN)('accounts RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;
  let accountBId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, 'acc-a');
    const b = await createUser(admin, 'acc-b');
    userAId = a.id;
    userBId = b.id;

    clientA = await signedInClient(a.email);

    const insB = await admin
      .from('accounts')
      .insert({ user_id: userBId, name: 'B cash', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (insB.error) throw insB.error;
    accountBId = insB.data.id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('A can insert and read their own account', async () => {
    const ins = await clientA
      .from('accounts')
      .insert({ user_id: userAId, name: 'A main', type: 'checking', currency: 'BAM' })
      .select('id, name')
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data?.name).toBe('A main');

    const list = await clientA.from('accounts').select('id').eq('user_id', userAId);
    expect(list.error).toBeNull();
    expect((list.data ?? []).length).toBeGreaterThan(0);
  });

  it("A cannot SELECT B's accounts (RLS filters silently)", async () => {
    const res = await clientA.from('accounts').select('id').eq('id', accountBId);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("A cannot UPDATE B's account (0 rows affected)", async () => {
    const upd = await clientA
      .from('accounts')
      .update({ name: 'hijacked' })
      .eq('id', accountBId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);

    const check = await admin.from('accounts').select('name').eq('id', accountBId).single();
    expect(check.data?.name).toBe('B cash');
  });

  it("A cannot DELETE B's account (0 rows affected)", async () => {
    const del = await clientA.from('accounts').delete().eq('id', accountBId).select('id');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);

    const check = await admin.from('accounts').select('id').eq('id', accountBId).single();
    expect(check.data?.id).toBe(accountBId);
  });

  it("A cannot insert an account with user_id = B's id", async () => {
    const ins = await clientA
      .from('accounts')
      .insert({ user_id: userBId, name: 'impostor', type: 'cash', currency: 'BAM' });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.message.toLowerCase()).toMatch(/row-level security|violates/);
  });
});
