/**
 * RLS for public.merchants and public.merchant_aliases.
 *
 * The aliases policy goes through `user_owns_merchant()` (migration 00006)
 * which was fixed in 00015 to exclude soft-deleted merchants. This spec
 * exercises that fix explicitly: soft-deleted merchant → cannot create
 * alias referencing it, even as owner.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

describe.skipIf(!SHOULD_RUN)('merchants + merchant_aliases RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;
  let merchantBId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, 'mer-a');
    const b = await createUser(admin, 'mer-b');
    userAId = a.id;
    userBId = b.id;

    clientA = await signedInClient(a.email);

    const merB = await admin
      .from('merchants')
      .insert({
        user_id: userBId,
        canonical_name: 'bim-mart',
        display_name: 'BIM Mart',
      })
      .select('id')
      .single();
    if (merB.error) throw merB.error;
    merchantBId = merB.data.id;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('A cannot SELECT B merchants (RLS filters)', async () => {
    const res = await clientA.from('merchants').select('id').eq('id', merchantBId);
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("A cannot UPDATE B's merchant", async () => {
    const upd = await clientA
      .from('merchants')
      .update({ display_name: 'Hijacked' })
      .eq('id', merchantBId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it("A cannot create an alias referencing B's merchant (user_owns_merchant denies)", async () => {
    const ins = await clientA
      .from('merchant_aliases')
      .insert({
        user_id: userAId,
        merchant_id: merchantBId,
        pattern: 'impostor',
        pattern_type: 'exact',
      });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.message.toLowerCase()).toMatch(/row-level security|violates/);
  });

  it('A cannot create an alias referencing their own soft-deleted merchant (regression for 00015)', async () => {
    const mer = await clientA
      .from('merchants')
      .insert({
        user_id: userAId,
        canonical_name: 'to-be-deleted',
        display_name: 'To Be Deleted',
      })
      .select('id')
      .single();
    expect(mer.error).toBeNull();
    const merchantId = mer.data?.id;
    if (!merchantId) throw new Error('expected merchant id');

    const softDelete = await clientA
      .from('merchants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', merchantId)
      .select('id');
    expect(softDelete.error).toBeNull();

    const aliasAttempt = await clientA
      .from('merchant_aliases')
      .insert({
        user_id: userAId,
        merchant_id: merchantId,
        pattern: 'ghost',
        pattern_type: 'exact',
      });
    expect(aliasAttempt.error).not.toBeNull();
    expect(aliasAttempt.error?.message.toLowerCase()).toMatch(/row-level security|violates/);
  });
});
