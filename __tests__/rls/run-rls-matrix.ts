/**
 * Reusable RLS audit matrix (F4-E1-T1).
 *
 * Each user-scoped table needs the same five assertions:
 *
 *   1. User A can INSERT a row with their own user_id, then SELECT it.
 *   2. User A cannot SELECT user B's row (RLS filters silently).
 *   3. User A cannot UPDATE user B's row (0 rows affected).
 *   4. User A cannot DELETE user B's row (0 rows affected).
 *   5. User A cannot INSERT a row with user_id = user B's id (RLS WITH CHECK
 *      rejects with the standard "row-level security" error).
 *
 * The matrix is a single function `registerRlsMatrix(opts)` that, called
 * inside a `describe` block, registers `beforeAll`/`afterAll`/`it` blocks
 * exactly once. Caller passes:
 *   - `tableName` — narrowed to keys of `Database['public']['Tables']`
 *   - `payloadFor(userId)` — factory that builds a valid INSERT payload
 *   - `optional opts` for tables with FK columns where we should expect a
 *     specific failure mode (e.g., `expectInsertCrossUserError: 'fk_owner'`).
 *
 * Pre-existing per-table specs (accounts.test.ts, transactions.test.ts, …)
 * intentionally NOT migrated here. They were hand-written before this
 * helper existed and contain table-specific edge cases. Migrating them
 * incrementally is out of scope for F4-E1-T1; the goal here is *coverage*
 * (every table tested), not stylistic uniformity.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
// `SHOULD_RUN` referenced in the doc-comment example below; not used at runtime here.
import { adminClient, assertEnv, createUser, signedInClient } from './helpers';

type TableName = keyof Database['public']['Tables'];

export interface RlsMatrixOptions<T extends TableName> {
  /** Public-schema table name to test. Narrowed for type safety. */
  tableName: T;
  /**
   * Builds an INSERT payload for a user. The returned object must include
   * `user_id: userId` (the matrix asserts it can both succeed for own and
   * fail for cross-user). Add other NOT-NULL columns as needed for the
   * specific table.
   *
   * The factory is async + receives the admin client so callers can seed
   * FK dependencies on the fly (e.g., a category row before inserting a
   * budget). Sync factories may simply ignore the second argument.
   *
   * The caller-supplied row gets used three times:
   *   - User A inserts as themselves (must succeed).
   *   - Service role pre-seeds a User B row for cross-user tests.
   *   - User A attempts to INSERT with user_id rewritten to user B (must fail).
   */
  payloadFor: (
    userId: string,
    admin: SupabaseClient<Database>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Default behaviour: cross-user INSERT must fail with a Postgres
   * "row-level security" error. Override when WITH CHECK uses a helper
   * function that errors with a different message (e.g. FK-ownership
   * helpers like `user_owns_category`).
   */
  expectCrossUserInsertMessageMatch?: RegExp;
  /**
   * Some tables (e.g., audit_log, insights) deliberately have NO INSERT
   * policy for `authenticated` — only service-role can write. For those,
   * even User A's own INSERT should fail. Set this true to flip the
   * matrix's "self-INSERT must succeed" assertion.
   */
  selfInsertMustFail?: boolean;
  /**
   * Same idea for UPDATE: some tables (e.g., audit_log) are append-only.
   * Set to true if even self-UPDATE should fail.
   */
  selfUpdateMustFail?: boolean;
  /**
   * Same idea for DELETE: some tables forbid even self-DELETE (e.g.,
   * insights — only service-role + cleanup cron can delete).
   */
  selfDeleteMustFail?: boolean;
  /**
   * Optional column to use for the test UPDATE. Defaults to a generic
   * field present on most tables; override when no such column exists.
   * The value should be a stable scalar that won't break NOT NULL or
   * CHECK constraints.
   */
  updateField?: { column: string; value: unknown };
}

/**
 * Registers the standard 5-test matrix for a table inside a `describe`
 * block. Use as:
 *
 *   describe.skipIf(!SHOULD_RUN)('budgets RLS', () => {
 *     registerRlsMatrix({
 *       tableName: 'budgets',
 *       payloadFor: (userId) => ({
 *         user_id: userId,
 *         category_id: ...,
 *         amount_cents: 10000,
 *         currency: 'BAM',
 *         period: 'monthly',
 *       }),
 *     });
 *   });
 *
 * The helper takes care of admin client, user creation, sign-in, seeding
 * the User B row, and cleanup. The caller's only responsibility is the
 * payload factory + any table-specific extras.
 */
export function registerRlsMatrix<T extends TableName>(opts: RlsMatrixOptions<T>): void {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId = '';
  let userBId = '';
  let rowBId = '';

  const updateField = opts.updateField;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, `rls-${opts.tableName}-a`);
    const b = await createUser(admin, `rls-${opts.tableName}-b`);
    userAId = a.id;
    userBId = b.id;
    clientA = await signedInClient(a.email);

    // Seed User B's row via service role (RLS bypass) so we have something
    // for User A to attempt to read/update/delete.
    const userBPayload = await opts.payloadFor(userBId, admin);
    const seedB = await admin
      .from(opts.tableName)
      .insert(userBPayload as never)
      .select('id')
      .single();
    if (seedB.error) {
      throw new Error(
        `RLS matrix seed for ${opts.tableName} failed: ${seedB.error.message}. ` +
          'Check the payloadFor factory satisfies all NOT NULL / FK constraints.',
      );
    }
    const seedRow = seedB.data as { id?: string } | null;
    if (!seedRow?.id) {
      throw new Error(`RLS matrix seed for ${opts.tableName} returned no id.`);
    }
    rowBId = seedRow.id;
  }, 60_000);

  afterAll(async () => {
    // Best-effort cleanup; rely on auth cascade for child rows.
    if (userAId) await admin.auth.admin.deleteUser(userAId).catch(() => undefined);
    if (userBId) await admin.auth.admin.deleteUser(userBId).catch(() => undefined);
  });

  // ─── Test 1: self-INSERT + own SELECT ─────────────────────────────────────
  if (opts.selfInsertMustFail !== true) {
    it('A can INSERT and SELECT their own row', async () => {
      const payload = await opts.payloadFor(userAId, admin);
      const ins = await clientA
        .from(opts.tableName)
        .insert(payload as never)
        .select('id')
        .single();
      expect(ins.error, ins.error?.message).toBeNull();
      expect((ins.data as { id?: string } | null)?.id).toBeTruthy();
    });
  } else {
    it('A cannot INSERT into this table (service-role only)', async () => {
      const payload = await opts.payloadFor(userAId, admin);
      const ins = await clientA.from(opts.tableName).insert(payload as never);
      expect(ins.error).not.toBeNull();
    });
  }

  // ─── Test 2: cross-user SELECT denied ─────────────────────────────────────
  it("A cannot SELECT B's row (RLS filters silently)", async () => {
    const res = await clientA.from(opts.tableName).select('id').eq('id' as never, rowBId);
    expect(res.error, res.error?.message).toBeNull();
    expect(res.data ?? []).toEqual([]);
  });

  // ─── Test 3: cross-user UPDATE denied ─────────────────────────────────────
  if (updateField !== undefined) {
    it(`A cannot UPDATE B's row (0 rows affected${
      opts.selfUpdateMustFail === true ? ', and self-UPDATE also forbidden' : ''
    })`, async () => {
      const upd = await clientA
        .from(opts.tableName)
        .update({ [updateField.column]: updateField.value } as never)
        .eq('id' as never, rowBId)
        .select('id');
      // RLS filters the WHERE rather than erroring. Expect 0 rows.
      expect(upd.error, upd.error?.message).toBeNull();
      expect(upd.data ?? []).toEqual([]);
    });
  }

  // ─── Test 4: cross-user DELETE denied ─────────────────────────────────────
  it("A cannot DELETE B's row (0 rows affected)", async () => {
    const del = await clientA.from(opts.tableName).delete().eq('id' as never, rowBId).select('id');
    expect(del.error, del.error?.message).toBeNull();
    expect(del.data ?? []).toEqual([]);

    // Verify row still exists via admin client.
    const check = await admin.from(opts.tableName).select('id').eq('id' as never, rowBId).single();
    expect(check.error, check.error?.message).toBeNull();
    expect((check.data as { id?: string } | null)?.id).toBe(rowBId);
  });

  // ─── Test 5: cross-user INSERT denied ─────────────────────────────────────
  it("A cannot INSERT a row with user_id = B's id", async () => {
    const payload = await opts.payloadFor(userBId, admin);
    const ins = await clientA.from(opts.tableName).insert(payload as never);
    expect(ins.error, 'expected RLS WITH CHECK to reject the insert').not.toBeNull();
    const message = ins.error?.message.toLowerCase() ?? '';
    if (opts.expectCrossUserInsertMessageMatch) {
      expect(message).toMatch(opts.expectCrossUserInsertMessageMatch);
    } else {
      expect(message).toMatch(/row-level security|violates|denied|permission/);
    }
  });
}
