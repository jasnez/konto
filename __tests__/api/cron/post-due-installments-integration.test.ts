/**
 * Integration test for /api/cron/post-due-installments (PR-1 regression).
 *
 * Pre-PR-1 the cron used cookie-based createClient(); since cron has no
 * session, RLS on installment_occurrences (which derives ownership from
 * installment_plans.user_id) silently returned 0 rows and the cron
 * always responded {posted: 0}. This integration test seeds a real
 * pending occurrence due today and asserts the handler:
 *   - returns posted=1, failed=0
 *   - inserts a transaction row tied to the seed account/user
 *   - flips the occurrence state from 'pending' to 'posted'
 *   - records the new transaction id on the occurrence
 *
 * Gated on RUN_INTEGRATION_TESTS=1 + a running local Supabase stack
 * (same env vars as __tests__/rls/* — see __tests__/rls/helpers.ts).
 *
 * All currencies are BAM so convertToBase + computeAccountLedgerCents
 * short-circuit on identity (no Frankfurter network call needed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import {
  adminClient,
  assertEnv,
  createUser,
  SHOULD_RUN,
  SUPABASE_URL,
  SERVICE_KEY,
} from '../../rls/helpers';
import { GET } from '@/app/api/cron/post-due-installments/route';

const CRON_SECRET = 'integration-test-cron-secret';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/post-due-installments', {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe.skipIf(!SHOULD_RUN)('post-due-installments cron — integration (PR-1)', () => {
  let admin: SupabaseClient<Database>;
  let userId = '';
  let accountId = '';
  let planId = '';
  let occurrenceId = '';

  beforeAll(async () => {
    assertEnv();

    // The route's createAdminClient() reads NEXT_PUBLIC_SUPABASE_URL +
    // SUPABASE_SERVICE_ROLE_KEY at call time. Bridge from the test-only
    // names into the names the runtime expects.
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

    admin = adminClient();
    const u = await createUser(admin, 'cron-pdi');
    userId = u.id;

    const acc = await admin
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'QA cron account',
        type: 'credit_card',
        currency: 'BAM',
      })
      .select('id')
      .single();
    if (acc.error) throw acc.error;
    accountId = acc.data.id;

    const plan = await admin
      .from('installment_plans')
      .insert({
        user_id: userId,
        account_id: accountId,
        currency: 'BAM',
        total_cents: 60_000,
        installment_cents: 10_000,
        installment_count: 6,
        day_of_month: 15,
        start_date: '2026-01-01',
        status: 'active',
      })
      .select('id')
      .single();
    if (plan.error) throw plan.error;
    planId = plan.data.id;

    // Due today so the cron picks it up regardless of when this test runs.
    const today = new Date().toISOString().slice(0, 10);
    const occ = await admin
      .from('installment_occurrences')
      .insert({
        plan_id: planId,
        occurrence_num: 1,
        amount_cents: 10_000,
        due_date: today,
        state: 'pending',
      })
      .select('id')
      .single();
    if (occ.error) throw occ.error;
    occurrenceId = occ.data.id;
  }, 60_000);

  afterAll(async () => {
    // Cascade deletes account/plan/occurrences/transactions via FK.
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  it('posts pending occurrence as transaction and flips state to posted', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as { posted: number; failed: number; today: string };
    expect(body.failed).toBe(0);
    expect(body.posted).toBe(1);

    // The occurrence should now reference a real transaction row.
    const occRes = await admin
      .from('installment_occurrences')
      .select('state, transaction_id')
      .eq('id', occurrenceId)
      .single();
    expect(occRes.error).toBeNull();
    expect(occRes.data?.state).toBe('posted');
    expect(occRes.data?.transaction_id).not.toBeNull();

    // The transaction row exists on the seeded account, marked as recurring.
    const txnRes = await admin
      .from('transactions')
      .select('id, account_id, source, is_recurring, original_amount_cents, original_currency')
      .eq('user_id', userId)
      .eq('account_id', accountId);
    expect(txnRes.error).toBeNull();
    expect(txnRes.data?.length).toBe(1);
    const txn = txnRes.data?.[0];
    expect(txn?.id).toBe(occRes.data?.transaction_id);
    expect(txn?.source).toBe('recurring');
    expect(txn?.is_recurring).toBe(true);
    // Amount is signed negative (outflow); 10_000 cents = 100 BAM.
    expect(txn?.original_amount_cents).toBe(-10_000);
    expect(txn?.original_currency).toBe('BAM');
  }, 30_000);
});
