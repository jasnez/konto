/**
 * Integration test for RLS policies on public.transactions.
 *
 * This test uses the local Supabase stack (`supabase start`) and skips itself
 * when RUN_INTEGRATION_TESTS is not set, so the default `pnpm test` run stays
 * hermetic. To run it:
 *
 *   supabase start
 *   supabase db reset
 *   $env:RUN_INTEGRATION_TESTS = '1'
 *   $env:SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
 *   $env:SUPABASE_ANON_KEY_TEST = '<anon/publishable key from `supabase status`>'
 *   $env:SUPABASE_SERVICE_KEY_TEST = '<service_role/secret key from `supabase status`>'
 *   pnpm test -- __tests__/rls/transactions.test.ts
 *
 * Regression scenario: before migration 00002, user A could INSERT a
 * transaction with their own user_id but another user's account_id. That
 * would pass the original `with check (auth.uid() = user_id)` policy.
 * This test locks the behavior down so it cannot regress.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1';

const SUPABASE_URL = process.env.SUPABASE_URL_TEST ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY_TEST ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_TEST ?? '';

function uniqueEmail(tag: string): string {
  return `qa-${tag}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@konto.local`;
}

describe.skipIf(!shouldRun)('transactions RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;
  let userBId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      throw new Error(
        'Integration test requires SUPABASE_URL_TEST, SUPABASE_ANON_KEY_TEST, SUPABASE_SERVICE_KEY_TEST.',
      );
    }

    admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const password = 'qa-test-password-12345';

    const createA = await admin.auth.admin.createUser({
      email: uniqueEmail('a'),
      password,
      email_confirm: true,
    });
    if (createA.error) throw createA.error;
    userAId = createA.data.user.id;

    const emailB = uniqueEmail('b');
    const createB = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (createB.error) throw createB.error;
    userBId = createB.data.user.id;

    const insertA = await admin
      .from('accounts')
      .insert({ user_id: userAId, name: 'A cash', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (insertA.error) throw insertA.error;
    accountAId = insertA.data.id;

    const insertB = await admin
      .from('accounts')
      .insert({ user_id: userBId, name: 'B cash', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (insertB.error) throw insertB.error;
    accountBId = insertB.data.id;

    clientA = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signInA = await clientA.auth.signInWithPassword({
      email: createA.data.user.email ?? '',
      password,
    });
    if (signInA.error) throw signInA.error;
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('user A can insert a transaction on their own account', async () => {
    const { error } = await clientA.from('transactions').insert({
      user_id: userAId,
      account_id: accountAId,
      original_amount_cents: -100,
      original_currency: 'BAM',
      base_amount_cents: -100,
      base_currency: 'BAM',
      account_ledger_cents: -100,
      transaction_date: new Date().toISOString().slice(0, 10),
      source: 'manual',
    });
    expect(error).toBeNull();
  });

  it("user A cannot insert a transaction pointing at user B's account_id", async () => {
    const { error } = await clientA.from('transactions').insert({
      user_id: userAId,
      account_id: accountBId,
      original_amount_cents: -9999,
      original_currency: 'BAM',
      base_amount_cents: -9999,
      base_currency: 'BAM',
      account_ledger_cents: -9999,
      transaction_date: new Date().toISOString().slice(0, 10),
      source: 'manual',
    });
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toMatch(/row-level security|violates/);

    const victim = await admin.from('transactions').select('id').eq('account_id', accountBId);
    expect(victim.error).toBeNull();
    expect(victim.data).toEqual([]);
  });

  it("user A cannot read user B's account via anon RLS", async () => {
    const result = await clientA.from('accounts').select('id').eq('id', accountBId);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });
});
