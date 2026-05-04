/**
 * RLS for public.installment_occurrences (F4-E1-T1).
 *
 * **No `user_id` column.** Ownership flows transitively through `plan_id`
 * → `installment_plans.user_id`. The RLS policy uses an EXISTS subquery
 * (or a SECURITY INVOKER helper) against the parent plan, so the matrix
 * generic helper doesn't fit — we write the spec by hand.
 *
 * Coverage:
 *   1. User A can SELECT occurrences of their own plan.
 *   2. User A cannot SELECT occurrences of User B's plan.
 *   3. User A cannot UPDATE / DELETE occurrences of User B's plan.
 *   4. User A cannot INSERT an occurrence pointing at User B's plan.
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

async function seedPlanFor(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{ planId: string; accountId: string }> {
  const acc = await admin
    .from('accounts')
    .insert({
      user_id: userId,
      name: `QA io acc ${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
      type: 'credit_card',
      currency: 'BAM',
    })
    .select('id')
    .single();
  if (acc.error) throw acc.error;
  const plan = await admin
    .from('installment_plans')
    .insert({
      user_id: userId,
      account_id: acc.data.id,
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
  return { planId: plan.data.id, accountId: acc.data.id };
}

describe.skipIf(!SHOULD_RUN)('installment_occurrences RLS', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId = '';
  let userBId = '';
  let planAId = '';
  let planBId = '';
  let occurrenceBId = '';

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    const a = await createUser(admin, 'io-a');
    const b = await createUser(admin, 'io-b');
    userAId = a.id;
    userBId = b.id;
    clientA = await signedInClient(a.email);

    const seedA = await seedPlanFor(admin, userAId);
    planAId = seedA.planId;
    const seedB = await seedPlanFor(admin, userBId);
    planBId = seedB.planId;

    // Seed one occurrence under user B's plan.
    const occ = await admin
      .from('installment_occurrences')
      .insert({
        plan_id: planBId,
        occurrence_num: 1,
        amount_cents: 10_000,
        due_date: '2026-02-15',
      })
      .select('id')
      .single();
    if (occ.error) throw occ.error;
    occurrenceBId = occ.data.id;
  }, 60_000);

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => undefined);
    if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => undefined);
  });

  it('A can INSERT and SELECT occurrences of their own plan', async () => {
    const ins = await clientA
      .from('installment_occurrences')
      .insert({
        plan_id: planAId,
        occurrence_num: 1,
        amount_cents: 10_000,
        due_date: '2026-02-15',
      })
      .select('id');
    expect(ins.error, ins.error?.message).toBeNull();
    expect(ins.data?.length).toBeGreaterThan(0);

    const list = await clientA
      .from('installment_occurrences')
      .select('id')
      .eq('plan_id', planAId);
    expect(list.error).toBeNull();
    expect((list.data ?? []).length).toBeGreaterThan(0);
  });

  it("A cannot SELECT occurrences of B's plan", async () => {
    const res = await clientA
      .from('installment_occurrences')
      .select('id')
      .eq('id', occurrenceBId);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  it("A cannot UPDATE B's occurrence (0 rows affected)", async () => {
    const upd = await clientA
      .from('installment_occurrences')
      .update({ state: 'cancelled' })
      .eq('id', occurrenceBId)
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data ?? []).toEqual([]);
  });

  it("A cannot DELETE B's occurrence (0 rows affected)", async () => {
    const del = await clientA
      .from('installment_occurrences')
      .delete()
      .eq('id', occurrenceBId)
      .select('id');
    expect(del.error).toBeNull();
    expect(del.data ?? []).toEqual([]);

    const check = await admin
      .from('installment_occurrences')
      .select('id')
      .eq('id', occurrenceBId)
      .single();
    expect(check.error).toBeNull();
    expect(check.data?.id).toBe(occurrenceBId);
  });

  it("A cannot INSERT an occurrence pointing at B's plan", async () => {
    const ins = await clientA.from('installment_occurrences').insert({
      plan_id: planBId,
      occurrence_num: 99,
      amount_cents: 1_000,
      due_date: '2026-12-15',
    });
    expect(ins.error).not.toBeNull();
    expect((ins.error?.message ?? '').toLowerCase()).toMatch(/row-level security|violates|denied/);
  });
});
