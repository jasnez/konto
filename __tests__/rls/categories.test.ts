/**
 * RLS for public.categories.
 *
 * Categories are seeded per user by the `handle_new_user` trigger on sign-up.
 * So both A and B already have a full default set at test start — we don't
 * need to insert our own to exercise cross-user isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

describe.skipIf(!SHOULD_RUN)('categories RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;
  let categoryBId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, 'cat-a');
    const b = await createUser(admin, 'cat-b');
    userAId = a.id;
    userBId = b.id;

    clientA = await signedInClient(a.email);

    const bCats = await admin
      .from('categories')
      .select('id')
      .eq('user_id', userBId)
      .limit(1)
      .single();
    if (bCats.error) throw bCats.error;
    categoryBId = bCats.data.id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('A can read their own categories (seeded by handle_new_user)', async () => {
    const res = await clientA.from('categories').select('id').eq('user_id', userAId);
    expect(res.error).toBeNull();
    expect((res.data ?? []).length).toBeGreaterThan(0);
  });

  it("A cannot SELECT B's categories", async () => {
    const res = await clientA.from('categories').select('id').eq('id', categoryBId);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("A cannot UPDATE B's category", async () => {
    const upd = await clientA
      .from('categories')
      .update({ name: 'hijacked' })
      .eq('id', categoryBId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it("A cannot DELETE B's category", async () => {
    const del = await clientA.from('categories').delete().eq('id', categoryBId).select('id');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);
  });

  it('parent_id cycle trigger rejects a self-reference (migration 00017)', async () => {
    const own = await clientA
      .from('categories')
      .insert({
        user_id: userAId,
        name: 'Test cat',
        slug: `test-cat-${String(Date.now())}`,
        kind: 'expense',
      })
      .select('id')
      .single();
    expect(own.error).toBeNull();
    const id = own.data?.id;
    if (!id) throw new Error('expected category id');

    const cycle = await clientA
      .from('categories')
      .update({ parent_id: id })
      .eq('id', id)
      .select('id');
    expect(cycle.error).not.toBeNull();
    expect(cycle.error?.message.toLowerCase()).toMatch(/self-reference|cycle|parent/);
  });
});
