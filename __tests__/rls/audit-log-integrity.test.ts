/**
 * Integration tests for audit_log append-only invariants (migration 00014):
 *
 *   1. event_type CHECK constraint rejects unknown event types.
 *   2. Known event types insert successfully.
 *   3. UPDATE on audit_log is blocked — both REVOKE and trigger agree.
 *   4. DELETE on audit_log is blocked — same.
 *
 * Tests use the service_role client specifically, because it has the widest
 * privilege footprint and is what writes audit events in production. If the
 * hardening holds for service_role, it also holds for authenticated (which
 * never had UPDATE/DELETE and is additionally gated by RLS).
 *
 * Skipped unless RUN_INTEGRATION_TESTS=1. See `transactions.test.ts` for
 * how to run locally.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1';

const SUPABASE_URL = process.env.SUPABASE_URL_TEST ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_TEST ?? '';

function uniqueEmail(tag: string): string {
  return `qa-${tag}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@konto.local`;
}

describe.skipIf(!shouldRun)('audit_log integrity', () => {
  let admin: SupabaseClient<Database>;
  let userId: string;

  beforeAll(async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error('Integration test requires SUPABASE_URL_TEST and SUPABASE_SERVICE_KEY_TEST.');
    }

    admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const created = await admin.auth.admin.createUser({
      email: uniqueEmail('audit'),
      password: 'qa-test-password-12345',
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('rejects unknown event_type via CHECK constraint', async () => {
    const { error } = await admin.from('audit_log').insert({
      user_id: userId,
      event_type: 'malicious_forged_event',
      event_data: {},
    });
    expect(error).not.toBeNull();
    // 23514 = check_violation
    expect(error?.message.toLowerCase()).toMatch(/check|violat/);
  });

  it('accepts every known event_type', async () => {
    const knownTypes = [
      'export_data',
      'account_deletion_requested',
      'account_deletion_cancelled',
      'account_deleted',
    ] as const;

    for (const eventType of knownTypes) {
      const { error } = await admin.from('audit_log').insert({
        user_id: userId,
        event_type: eventType,
        event_data: {},
      });
      expect(error, `inserting ${eventType}`).toBeNull();
    }
  });

  it('blocks UPDATE on audit_log even for service_role', async () => {
    const { data: inserted, error: insertError } = await admin
      .from('audit_log')
      .insert({
        user_id: userId,
        event_type: 'export_data',
        event_data: { byte_length: 10 },
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    if (!inserted) throw new Error('expected inserted row');

    const { error: updateError } = await admin
      .from('audit_log')
      .update({ event_data: { byte_length: 99999 } })
      .eq('id', inserted.id);

    expect(updateError).not.toBeNull();
    // Either REVOKE denies the write ("permission denied") or the trigger
    // raises ("append-only"). Both are acceptable — the invariant holds.
    expect(updateError?.message.toLowerCase()).toMatch(/permission|append-only|privilege/);
  });

  it('blocks DELETE on audit_log even for service_role', async () => {
    const { data: inserted, error: insertError } = await admin
      .from('audit_log')
      .insert({
        user_id: userId,
        event_type: 'export_data',
        event_data: {},
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    if (!inserted) throw new Error('expected inserted row');

    const { error: deleteError } = await admin.from('audit_log').delete().eq('id', inserted.id);

    expect(deleteError).not.toBeNull();
    expect(deleteError?.message.toLowerCase()).toMatch(/permission|append-only|privilege/);
  });
});
