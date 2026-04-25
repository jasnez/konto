/**
 * Integration test for the `update_account_balance` trigger (migrations 00013,
 * 00035 multi-currency sum).
 *
 * Uses the local Supabase stack and skips itself unless RUN_INTEGRATION_TESTS
 * is set — same convention as `transactions.test.ts`. To run locally:
 *
 *   supabase start && supabase db reset
 *   $env:RUN_INTEGRATION_TESTS = '1'
 *   $env:SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
 *   $env:SUPABASE_ANON_KEY_TEST = '<anon key>'
 *   $env:SUPABASE_SERVICE_KEY_TEST = '<service_role key>'
 *   pnpm test -- __tests__/rls/account-balance-trigger.test.ts
 *
 * Covers every path the trigger must handle, because the column feeds the
 * dashboard net-worth widget and there is no higher-level invariant check.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1';

const SUPABASE_URL = process.env.SUPABASE_URL_TEST ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_TEST ?? '';

function uniqueEmail(tag: string): string {
  return `qa-${tag}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@konto.local`;
}

async function getBalance(admin: SupabaseClient<Database>, accountId: string): Promise<bigint> {
  const { data, error } = await admin
    .from('accounts')
    .select('current_balance_cents')
    .eq('id', accountId)
    .single();
  if (error) throw error;
  return BigInt(data.current_balance_cents);
}

const TODAY = new Date().toISOString().slice(0, 10);

interface InsertTxParams {
  userId: string;
  accountId: string;
  amount: number;
}

describe.skipIf(!shouldRun)('update_account_balance trigger', () => {
  let admin: SupabaseClient<Database>;
  let userId: string;
  let accountAId: string;
  let accountBId: string;

  async function insertTx({ userId: u, accountId, amount }: InsertTxParams): Promise<string> {
    const { data, error } = await admin
      .from('transactions')
      .insert({
        user_id: u,
        account_id: accountId,
        original_amount_cents: amount,
        original_currency: 'BAM',
        base_amount_cents: amount,
        base_currency: 'BAM',
        transaction_date: TODAY,
        source: 'manual',
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(() => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Integration test requires SUPABASE_URL_TEST and SUPABASE_SERVICE_KEY_TEST.');
    }

    admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  beforeEach(async () => {
    // Fresh user + accounts per test so balances start at zero and state
    // bleed between tests is impossible.
    const created = await admin.auth.admin.createUser({
      email: uniqueEmail('balance'),
      password: 'qa-test-password-12345',
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const a = await admin
      .from('accounts')
      .insert({ user_id: userId, name: 'A', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (a.error) throw a.error;
    accountAId = a.data.id;

    const b = await admin
      .from('accounts')
      .insert({ user_id: userId, name: 'B', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (b.error) throw b.error;
    accountBId = b.data.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('INSERT bumps balance by the transaction amount', async () => {
    await insertTx({ userId, accountId: accountAId, amount: 5000 });
    expect(await getBalance(admin, accountAId)).toBe(5000n);

    await insertTx({ userId, accountId: accountAId, amount: -1500 });
    expect(await getBalance(admin, accountAId)).toBe(3500n);
  });

  it('UPDATE to original_amount_cents re-syncs the balance', async () => {
    const txId = await insertTx({ userId, accountId: accountAId, amount: 1000 });
    expect(await getBalance(admin, accountAId)).toBe(1000n);

    const { error } = await admin
      .from('transactions')
      .update({ original_amount_cents: 4200 })
      .eq('id', txId);
    expect(error).toBeNull();
    expect(await getBalance(admin, accountAId)).toBe(4200n);
  });

  it('soft-delete removes the amount; restore adds it back', async () => {
    const txId = await insertTx({ userId, accountId: accountAId, amount: 2500 });
    expect(await getBalance(admin, accountAId)).toBe(2500n);

    const deletedAt = await admin
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', txId);
    expect(deletedAt.error).toBeNull();
    expect(await getBalance(admin, accountAId)).toBe(0n);

    const restored = await admin.from('transactions').update({ deleted_at: null }).eq('id', txId);
    expect(restored.error).toBeNull();
    expect(await getBalance(admin, accountAId)).toBe(2500n);
  });

  it('hard DELETE removes the amount', async () => {
    const txId = await insertTx({ userId, accountId: accountAId, amount: 800 });
    expect(await getBalance(admin, accountAId)).toBe(800n);

    const { error } = await admin.from('transactions').delete().eq('id', txId);
    expect(error).toBeNull();
    expect(await getBalance(admin, accountAId)).toBe(0n);
  });

  it('moving a transaction between accounts rebalances both', async () => {
    const txId = await insertTx({ userId, accountId: accountAId, amount: 3000 });
    expect(await getBalance(admin, accountAId)).toBe(3000n);
    expect(await getBalance(admin, accountBId)).toBe(0n);

    const { error } = await admin
      .from('transactions')
      .update({ account_id: accountBId })
      .eq('id', txId);
    expect(error).toBeNull();

    expect(await getBalance(admin, accountAId)).toBe(0n);
    expect(await getBalance(admin, accountBId)).toBe(3000n);
  });

  it('transfer pair (two rows, opposite signs) updates both accounts', async () => {
    // Modeled the way the app will insert transfers: one outflow on A, one
    // inflow on B, same absolute amount.
    await insertTx({ userId, accountId: accountAId, amount: -1200 });
    await insertTx({ userId, accountId: accountBId, amount: 1200 });

    expect(await getBalance(admin, accountAId)).toBe(-1200n);
    expect(await getBalance(admin, accountBId)).toBe(1200n);
  });

  it('BAM account + foreign original uses base_amount_cents for balance (e.g. receipt SEK)', async () => {
    const originalSek = -34_217; // −342.17 SEK (minor units)
    const baseBam = -6185; // −61.85 KM — must drive balance, not originalSek
    const { data, error } = await admin
      .from('transactions')
      .insert({
        user_id: userId,
        account_id: accountAId,
        original_amount_cents: originalSek,
        original_currency: 'SEK',
        base_amount_cents: baseBam,
        base_currency: 'BAM',
        transaction_date: TODAY,
        source: 'import_receipt',
      })
      .select('id')
      .single();
    if (error) throw error;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();

    expect(await getBalance(admin, accountAId)).toBe(BigInt(baseBam));
  });

  it('balance is zero for a brand-new account with no transactions', async () => {
    expect(await getBalance(admin, accountAId)).toBe(0n);
    expect(await getBalance(admin, accountBId)).toBe(0n);
  });
});
