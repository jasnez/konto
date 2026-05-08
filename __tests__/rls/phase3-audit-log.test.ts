/**
 * Integration test for DL-9 trigger-based Phase 3 audit logging.
 *
 * Migration `20260626120000_00069_phase3_audit_log.sql` introduces:
 *   - 9 new event_type values registered in audit_log CHECK constraint
 *   - audit_phase3_change() SECURITY DEFINER trigger function
 *   - AFTER INSERT/UPDATE/DELETE triggers on budgets, goals, recurring_transactions
 *
 * What this spec asserts (one round-trip per table):
 *   1. INSERT into a Phase 3 table writes a 'X_created' row to audit_log
 *      with event_data.entity_id matching the new row id and the
 *      correct user_id attribution.
 *   2. UPDATE on the row writes a 'X_updated' audit entry.
 *   3. DELETE writes a 'X_deleted' audit entry (sourced from OLD).
 *
 * Service-role attribution: all writes go through the admin client
 * (bypasses RLS), but the trigger reads NEW/OLD.user_id rather than
 * auth.uid(), so the audit entry is correctly attributed to the seeded
 * user (not the service role).
 *
 * Gated on RUN_INTEGRATION_TESTS=1 + a running local Supabase stack.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { adminClient, assertEnv, createUser, SHOULD_RUN } from './helpers';

interface SeedResult {
  userId: string;
  accountId: string;
  categoryId: string;
}

async function seedUserWithAccountAndCategory(
  admin: SupabaseClient<Database>,
): Promise<SeedResult> {
  const u = await createUser(admin, 'audit-dl9');
  const userId = u.id;

  // Account is required FK for budgets / goals (account_id) and downstream
  // recurring patterns. Use BAM and 'checking' so no FX or special handling
  // intrudes on the audit assertions.
  const acc = await admin
    .from('accounts')
    .insert({
      user_id: userId,
      name: 'QA audit acc',
      type: 'checking',
      currency: 'BAM',
    })
    .select('id')
    .single();
  if (acc.error) throw acc.error;

  // Need a budgetable category for the budgets row.
  const cat = await admin
    .from('categories')
    .insert({
      user_id: userId,
      name: 'QA audit category',
      slug: `qa-audit-${String(Date.now())}`,
      kind: 'expense',
    })
    .select('id')
    .single();
  if (cat.error) throw cat.error;

  return { userId, accountId: acc.data.id, categoryId: cat.data.id };
}

async function expectAuditRow(
  admin: SupabaseClient<Database>,
  userId: string,
  eventType: string,
  entityId: string,
): Promise<void> {
  const res = await admin
    .from('audit_log')
    .select('event_type, user_id, event_data')
    .eq('user_id', userId)
    .eq('event_type', eventType);
  expect(res.error).toBeNull();
  expect(res.data?.length, `expected one ${eventType} row, got ${String(res.data?.length)}`).toBe(
    1,
  );
  const row = res.data?.[0];
  expect(row?.user_id).toBe(userId);
  expect(row?.event_type).toBe(eventType);
  // event_data is jsonb; Supabase returns it as a parsed object.
  const data = row?.event_data as { entity_id?: string; tg_op?: string } | null;
  expect(data?.entity_id).toBe(entityId);
}

describe.skipIf(!SHOULD_RUN)('DL-9: Phase 3 audit log triggers', () => {
  let admin: SupabaseClient<Database>;
  let seed: SeedResult;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();
    seed = await seedUserWithAccountAndCategory(admin);
  }, 30_000);

  afterAll(async () => {
    if (seed.userId) {
      await admin.auth.admin.deleteUser(seed.userId).catch(() => undefined);
    }
  });

  it('budgets: insert / update / delete each emit one matching audit_log row', async () => {
    // INSERT
    const ins = await admin
      .from('budgets')
      .insert({
        user_id: seed.userId,
        category_id: seed.categoryId,
        amount_cents: 50_000,
        currency: 'BAM',
        period: 'monthly',
        rollover: false,
      })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const budgetId = ins.data?.id ?? '';
    expect(budgetId).not.toBe('');
    await expectAuditRow(admin, seed.userId, 'budget_created', budgetId);

    // UPDATE
    const upd = await admin.from('budgets').update({ amount_cents: 60_000 }).eq('id', budgetId);
    expect(upd.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'budget_updated', budgetId);

    // DELETE
    const del = await admin.from('budgets').delete().eq('id', budgetId);
    expect(del.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'budget_deleted', budgetId);
  }, 30_000);

  it('goals: insert / update / delete each emit one matching audit_log row', async () => {
    const ins = await admin
      .from('goals')
      .insert({
        user_id: seed.userId,
        name: 'QA audit goal',
        target_amount_cents: 100_000,
        currency: 'BAM',
      })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const goalId = ins.data?.id ?? '';
    expect(goalId).not.toBe('');
    await expectAuditRow(admin, seed.userId, 'goal_created', goalId);

    const upd = await admin.from('goals').update({ target_amount_cents: 150_000 }).eq('id', goalId);
    expect(upd.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'goal_updated', goalId);

    const del = await admin.from('goals').delete().eq('id', goalId);
    expect(del.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'goal_deleted', goalId);
  }, 30_000);

  it('recurring_transactions: insert / update / delete each emit one matching audit_log row', async () => {
    const ins = await admin
      .from('recurring_transactions')
      .insert({
        user_id: seed.userId,
        account_id: seed.accountId,
        description: 'QA audit recurring',
        period: 'monthly',
        average_amount_cents: -1500,
        currency: 'BAM',
        last_seen_date: '2026-04-01',
      })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const recurringId = ins.data?.id ?? '';
    expect(recurringId).not.toBe('');
    await expectAuditRow(admin, seed.userId, 'recurring_created', recurringId);

    const upd = await admin
      .from('recurring_transactions')
      .update({ description: 'QA audit recurring (renamed)' })
      .eq('id', recurringId);
    expect(upd.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'recurring_updated', recurringId);

    const del = await admin.from('recurring_transactions').delete().eq('id', recurringId);
    expect(del.error).toBeNull();
    await expectAuditRow(admin, seed.userId, 'recurring_deleted', recurringId);
  }, 30_000);
});
