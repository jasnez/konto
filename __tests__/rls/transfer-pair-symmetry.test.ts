/**
 * DL-2 integration test — transfer pair symmetry constraints.
 *
 * Verifies that migration 00040 enforces invariants at the database layer
 * even when callers bypass the create_transfer_pair RPC (e.g. via service
 * role direct INSERT/UPDATE). The four invariants are:
 *
 *   1. is_transfer ↔ transfer_pair_id IS NOT NULL  (CHECK constraint)
 *   2. A.transfer_pair_id = B  ⇒  B.transfer_pair_id = A           (trigger)
 *   3. Both legs share the same user_id                            (trigger)
 *   4. (A.deleted_at IS NULL) = (B.deleted_at IS NULL)             (trigger)
 *
 * Plus: deleting one leg cascades to the other (FK ON DELETE CASCADE).
 *
 * Run via: RUN_INTEGRATION_TESTS=1 pnpm test -- __tests__/rls/transfer-pair-symmetry.test.ts
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

describe.skipIf(!SHOULD_RUN)('DL-2: transfer pair symmetry', () => {
  let admin: SupabaseClient<Database>;
  let userAClient: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const userA = await createUser(admin, 'pair-a');
    userAId = userA.id;
    userAClient = await signedInClient(userA.email);

    const userB = await createUser(admin, 'pair-b');
    userBId = userB.id;

    const accA = await admin
      .from('accounts')
      .insert({ user_id: userAId, name: 'A wallet', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (accA.error) throw accA.error;
    accountAId = accA.data.id;

    const accB = await admin
      .from('accounts')
      .insert({ user_id: userAId, name: 'A bank', type: 'checking', currency: 'BAM' })
      .select('id')
      .single();
    if (accB.error) throw accB.error;
    accountBId = accB.data.id;

  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  });

  async function createPairViaRpc(): Promise<{ fromId: string; toId: string }> {
    const { data, error } = await (
      userAClient.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<
        typeof userAClient.rpc
      >
    )('create_transfer_pair', {
      p_from_account_id: accountAId,
      p_to_account_id: accountBId,
      p_from_amount_cents: -10000,
      p_to_amount_cents: 10000,
      p_from_currency: 'BAM',
      p_to_currency: 'BAM',
      p_from_base_cents: -10000,
      p_to_base_cents: 10000,
      p_base_currency: 'BAM',
      p_from_fx_rate: 1,
      p_to_fx_rate: 1,
      p_from_fx_rate_date: '2026-04-26',
      p_to_fx_rate_date: '2026-04-26',
      p_from_fx_stale: false,
      p_to_fx_stale: false,
      p_transaction_date: '2026-04-26',
      p_notes: 'integration test pair',
    });
    if (error) throw error;
    const result = data as unknown as { from_id: string; to_id: string };
    return { fromId: result.from_id, toId: result.to_id };
  }

  it('RPC successfully creates a symmetric pair', async () => {
    const { fromId, toId } = await createPairViaRpc();
    const { data: rows, error } = await admin
      .from('transactions')
      .select('id,is_transfer,transfer_pair_id,user_id,deleted_at')
      .in('id', [fromId, toId]);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    const fromRow = rows?.find((r) => r.id === fromId);
    const toRow = rows?.find((r) => r.id === toId);
    expect(fromRow?.is_transfer).toBe(true);
    expect(toRow?.is_transfer).toBe(true);
    expect(fromRow?.transfer_pair_id).toBe(toId);
    expect(toRow?.transfer_pair_id).toBe(fromId);
    expect(fromRow?.user_id).toBe(userAId);
    expect(toRow?.user_id).toBe(userAId);
  });

  it('CHECK constraint blocks INSERT with is_transfer=true and NULL transfer_pair_id', async () => {
    const { error } = await admin.from('transactions').insert({
      user_id: userAId,
      account_id: accountAId,
      original_amount_cents: -100,
      original_currency: 'BAM',
      base_amount_cents: -100,
      base_currency: 'BAM',
      account_ledger_cents: -100,
      transaction_date: '2026-04-26',
      source: 'manual',
      is_transfer: true,
      transfer_pair_id: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/transfer_pair_consistency|check/iu);
  });

  it('CHECK constraint blocks INSERT with is_transfer=false and non-null transfer_pair_id', async () => {
    const { fromId } = await createPairViaRpc();
    const { error } = await admin.from('transactions').insert({
      user_id: userAId,
      account_id: accountAId,
      original_amount_cents: -100,
      original_currency: 'BAM',
      base_amount_cents: -100,
      base_currency: 'BAM',
      account_ledger_cents: -100,
      transaction_date: '2026-04-26',
      source: 'manual',
      is_transfer: false,
      transfer_pair_id: fromId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/transfer_pair_consistency|check/iu);
  });

  it('symmetry trigger blocks asymmetric pair insertion', async () => {
    // Try to insert two rows where A→B but B→C (some unrelated id).
    const fakePartnerId = '00000000-0000-0000-0000-000000000001';
    // Single transaction with deferred FK + trigger: trigger fires at COMMIT
    // and sees that fakePartnerId doesn't exist (or doesn't point back).
    const { error } = await admin.from('transactions').insert({
      user_id: userAId,
      account_id: accountAId,
      original_amount_cents: -100,
      original_currency: 'BAM',
      base_amount_cents: -100,
      base_currency: 'BAM',
      account_ledger_cents: -100,
      transaction_date: '2026-04-26',
      source: 'manual',
      is_transfer: true,
      transfer_pair_id: fakePartnerId,
    });
    expect(error).not.toBeNull();
    // FK violation OR trigger exception, depending on which constraint fires first.
    expect(error?.message).toMatch(/TRANSFER_PAIR_INVARIANT|foreign key|partner/iu);
  });

  it('CASCADE delete removes both legs when one is hard-deleted', async () => {
    const { fromId, toId } = await createPairViaRpc();
    const { error } = await admin.from('transactions').delete().eq('id', fromId);
    expect(error).toBeNull();
    const { data: surviving, error: selErr } = await admin
      .from('transactions')
      .select('id')
      .in('id', [fromId, toId]);
    expect(selErr).toBeNull();
    expect(surviving).toHaveLength(0);
  });

  it('symmetry trigger blocks setting deleted_at on only one leg', async () => {
    const { fromId } = await createPairViaRpc();
    const { error } = await admin
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', fromId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/TRANSFER_PAIR_INVARIANT|deleted_at/iu);
  });

  it('symmetric soft-delete (both legs) succeeds', async () => {
    const { fromId, toId } = await createPairViaRpc();
    const ts = new Date().toISOString();
    const { error } = await admin
      .from('transactions')
      .update({ deleted_at: ts })
      .in('id', [fromId, toId]);
    expect(error).toBeNull();
    const { data: rows } = await admin
      .from('transactions')
      .select('id,deleted_at')
      .in('id', [fromId, toId]);
    expect(rows).toHaveLength(2);
    expect(rows?.every((r) => r.deleted_at !== null)).toBe(true);
  });

  it('blocks UPDATE that converts is_transfer=true → false while still referenced', async () => {
    const { fromId, toId } = await createPairViaRpc();
    // Try to flip is_transfer on `from` to false. The other leg still
    // references it, so the trigger must reject.
    const { error } = await admin
      .from('transactions')
      .update({ is_transfer: false, transfer_pair_id: null })
      .eq('id', fromId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/TRANSFER_PAIR_INVARIANT|references it/iu);
    // Cleanup so afterAll can succeed.
    await admin.from('transactions').delete().in('id', [fromId, toId]);
  });
});
