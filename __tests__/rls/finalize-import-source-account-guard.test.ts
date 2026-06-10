/**
 * Regression test for K-1 (audit 2026-06-10): finalize_import_batch must
 * verify ownership of the SOURCE account_id, not just the transfer
 * to_account_id.
 *
 * finalize_import_batch is SECURITY DEFINER and granted to `authenticated`,
 * so any logged-in user can call it directly. Before migration 00074 it
 * trusted the caller-supplied `account_id` in p_rows for regular rows. An
 * attacker with their own 'ready' batch could inject a row referencing a
 * VICTIM's account_id and corrupt the victim's balance (the balance trigger
 * sums by account_id with no user_id filter).
 *
 * Run locally:
 *   supabase start && supabase db reset
 *   $env:RUN_INTEGRATION_TESTS = '1'
 *   $env:SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
 *   $env:SUPABASE_ANON_KEY_TEST = '<anon key>'
 *   $env:SUPABASE_SERVICE_KEY_TEST = '<service_role key>'
 *   pnpm test -- __tests__/rls/finalize-import-source-account-guard.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

const TODAY = new Date().toISOString().slice(0, 10);

async function balanceOf(admin: SupabaseClient<Database>, accountId: string): Promise<bigint> {
  const { data, error } = await admin
    .from('accounts')
    .select('current_balance_cents')
    .eq('id', accountId)
    .single();
  if (error) throw error;
  return BigInt(data.current_balance_cents);
}

async function createAccount(
  admin: SupabaseClient<Database>,
  userId: string,
  name: string,
): Promise<string> {
  const { data, error } = await admin
    .from('accounts')
    .insert({ user_id: userId, name, type: 'cash', currency: 'BAM' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function createReadyBatch(
  admin: SupabaseClient<Database>,
  userId: string,
  accountId: string,
): Promise<string> {
  const { data, error } = await admin
    .from('import_batches')
    .insert({
      user_id: userId,
      account_id: accountId,
      checksum: `qa-k1-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
      original_filename: 'qa-k1.pdf',
      status: 'ready',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

function importRow(accountId: string, amountCents: number) {
  return {
    account_id: accountId,
    to_account_id: null,
    original_amount_cents: amountCents,
    original_currency: 'BAM',
    base_amount_cents: amountCents,
    base_currency: 'BAM',
    account_ledger_cents: amountCents,
    fx_rate: 1,
    fx_rate_date: TODAY,
    fx_stale: false,
    transaction_date: TODAY,
    merchant_raw: 'QA K-1',
    merchant_id: null,
    category_id: null,
    category_source: null,
    category_confidence: null,
    dedup_hash: `qa-k1-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
  };
}

describe.skipIf(!SHOULD_RUN)('finalize_import_batch source-account ownership (K-1)', () => {
  let admin: SupabaseClient<Database>;
  let attackerId = '';
  let attackerEmail = '';
  let victimId = '';
  let attackerClient: SupabaseClient<Database>;
  let attackerAccountId: string;
  let victimAccountId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    const a = await createUser(admin, 'k1-attacker');
    const v = await createUser(admin, 'k1-victim');
    attackerId = a.id;
    attackerEmail = a.email;
    victimId = v.id;
    attackerClient = await signedInClient(attackerEmail);
    attackerAccountId = await createAccount(admin, attackerId, 'Attacker');
    victimAccountId = await createAccount(admin, victimId, 'Victim');
  });

  afterAll(async () => {
    if (attackerId) await admin.auth.admin.deleteUser(attackerId);
    if (victimId) await admin.auth.admin.deleteUser(victimId);
  });

  it("rejects a row that targets another user's account_id and leaves the victim balance untouched", async () => {
    const batchId = await createReadyBatch(admin, attackerId, attackerAccountId);

    const { error } = await attackerClient.rpc('finalize_import_batch', {
      p_batch_id: batchId,
      p_rows: [importRow(victimAccountId, 999_999_99)],
      p_dedup_skipped: 0,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain('FORBIDDEN');

    // Victim's balance must be unchanged, and no row may have landed there.
    expect(await balanceOf(admin, victimAccountId)).toBe(0n);
    const { count } = await admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', victimAccountId);
    expect(count).toBe(0);
  });

  it("still allows finalizing a batch into the caller's OWN account (no regression)", async () => {
    const batchId = await createReadyBatch(admin, attackerId, attackerAccountId);

    const { error } = await attackerClient.rpc('finalize_import_batch', {
      p_batch_id: batchId,
      p_rows: [importRow(attackerAccountId, 5_000)],
      p_dedup_skipped: 0,
    });

    expect(error).toBeNull();
    expect(await balanceOf(admin, attackerAccountId)).toBe(5_000n);
  });
});
