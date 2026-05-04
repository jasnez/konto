/**
 * RLS for public.ignored_recurring_candidates (F4-E1-T1).
 *
 * Composite primary key: (user_id, group_key). The matrix's standard
 * test 4 (cross-user DELETE filtered to `id = rowBId`) doesn't apply
 * because there is no `id` column. We skip this matrix and write a
 * minimal hand-rolled spec instead.
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

describe.skipIf(!SHOULD_RUN)('ignored_recurring_candidates RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId = '';
  let userBId = '';
  const groupKeyB = `qa-group-b-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    const a = await createUser(admin, 'irc-a');
    const b = await createUser(admin, 'irc-b');
    userAId = a.id;
    userBId = b.id;
    clientA = await signedInClient(a.email);

    const seed = await admin
      .from('ignored_recurring_candidates')
      .insert({ user_id: userBId, group_key: groupKeyB });
    if (seed.error) throw seed.error;
  }, 60_000);

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => undefined);
    if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => undefined);
  });

  it('A can INSERT and SELECT their own row', async () => {
    const ins = await clientA
      .from('ignored_recurring_candidates')
      .insert({ user_id: userAId, group_key: 'qa-own' });
    expect(ins.error, ins.error?.message).toBeNull();

    const list = await clientA
      .from('ignored_recurring_candidates')
      .select('group_key')
      .eq('user_id', userAId);
    expect(list.error).toBeNull();
    expect((list.data ?? []).map((r) => r.group_key)).toContain('qa-own');
  });

  it("A cannot SELECT B's row", async () => {
    const res = await clientA
      .from('ignored_recurring_candidates')
      .select('group_key')
      .eq('user_id', userBId);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it("A cannot DELETE B's row (0 rows affected)", async () => {
    const del = await clientA
      .from('ignored_recurring_candidates')
      .delete()
      .eq('user_id', userBId)
      .eq('group_key', groupKeyB)
      .select('group_key');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);

    const check = await admin
      .from('ignored_recurring_candidates')
      .select('group_key')
      .eq('user_id', userBId)
      .eq('group_key', groupKeyB)
      .single();
    expect(check.error).toBeNull();
    expect(check.data?.group_key).toBe(groupKeyB);
  });

  it("A cannot INSERT a row with user_id = B's id", async () => {
    const ins = await clientA
      .from('ignored_recurring_candidates')
      .insert({ user_id: userBId, group_key: 'qa-impostor' });
    expect(ins.error).not.toBeNull();
    expect((ins.error?.message ?? '').toLowerCase()).toMatch(/row-level security|violates/);
  });
});
