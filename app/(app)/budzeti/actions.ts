'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  BudgetIdParamSchema,
  CreateBudgetSchema,
  ToggleBudgetActiveSchema,
  UpdateBudgetSchema,
} from '@/lib/budgets/validation';
import { ensureOwnedCategory } from '@/lib/server/db/ensure-owned';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

const PreviewPeriodSpentSchema = z.object({
  category_id: z.uuid(),
  period: z.enum(['monthly', 'weekly']),
  offset: z.number().int().min(-12).max(0).default(-1),
});

export type PreviewPeriodSpentResult =
  | { success: true; data: { spentCents: string } }
  | { success: false; error: 'VALIDATION_ERROR' }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

/**
 * @public
 * Returns total spending for the given category over a relative period.
 * `offset = -1` (default) is "previous monthly/weekly" — used by the budget
 * Add form to suggest a realistic limit.
 *
 * Reads via the SECURITY-INVOKER RPC `get_period_spent_for_category`. The
 * RPC enforces auth.uid() and rejects foreign category_ids by returning 0
 * (no row leak; this Server Action just surfaces the bigint).
 */
export async function previewCategoryPeriodSpent(
  input: unknown,
): Promise<PreviewPeriodSpentResult> {
  const parsed = PreviewPeriodSpentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'VALIDATION_ERROR' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data, error } = await supabase.rpc('get_period_spent_for_category', {
    p_category_id: parsed.data.category_id,
    p_period: parsed.data.period,
    p_offset: parsed.data.offset,
  });
  if (error) {
    logSafe('preview_category_period_spent', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  // RPC returns bigint; supabase-js may surface it as number | string. Normalise
  // through BigInt so the client always receives a deterministic decimal string.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const spent = data === null || data === undefined ? 0n : BigInt(data);
  return { success: true, data: { spentCents: spent.toString() } };
}

type BudgetUpdate = Database['public']['Tables']['budgets']['Update'];

interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
}

function asErrorTree<T>(t: z.core.$ZodErrorTree<T>): ZodErrorTree {
  // Zod's tree type is structurally compatible with our local `ZodErrorTree`
  // shape but TS still wants an explicit cast. Eslint sometimes flags this
  // as unnecessary depending on inference context — disable narrowly.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return t as unknown as ZodErrorTree;
}

function buildCreateBudgetErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    category_id: t.properties?.category_id?.errors,
    amount_cents: t.properties?.amount_cents?.errors,
    currency: t.properties?.currency?.errors,
    period: t.properties?.period?.errors,
    rollover: t.properties?.rollover?.errors,
    _root: t.errors,
  };
}

function buildUpdateBudgetErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    category_id: t.properties?.category_id?.errors,
    amount_cents: t.properties?.amount_cents?.errors,
    currency: t.properties?.currency?.errors,
    period: t.properties?.period?.errors,
    rollover: t.properties?.rollover?.errors,
    _root: t.errors,
  };
}

// ─── Result types ────────────────────────────────────────────────────────────

export type CreateBudgetResult =
  | { success: true; data: { id: string } }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildCreateBudgetErrorDetails>;
    }
  | { success: false; error: 'UNAUTHORIZED' }
  // SE-13: explicit ownership pre-check on category_id (was relying solely
  // on RLS WITH CHECK; now defense-in-depth with explicit verification).
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'CATEGORY_NOT_BUDGETABLE' }
  | { success: false; error: 'DUPLICATE_ACTIVE' }
  | { success: false; error: 'DATABASE_ERROR' };

export type UpdateBudgetResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildUpdateBudgetErrorDetails> | { _root: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  // BG-1: changing `period` shifts the spending baseline (1000 KM/month
  // ≠ 1000 KM/week). Auto-scaling is mathematically dubious (30-day
  // month / 7 = 4.29 weeks). Server rejects period-only changes; the
  // UI must show the conversion math and ask the user to re-enter the
  // amount explicitly.
  | { success: false; error: 'PERIOD_CHANGE_REQUIRES_AMOUNT' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'CATEGORY_NOT_BUDGETABLE' }
  | { success: false; error: 'DUPLICATE_ACTIVE' }
  | { success: false; error: 'DATABASE_ERROR' };

export type ToggleBudgetActiveResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DUPLICATE_ACTIVE' }
  | { success: false; error: 'DATABASE_ERROR' };

export type DeleteBudgetResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function centsToDbInt(c: bigint): number {
  // MT-10: guard the bigint→number narrowing. Above 2^53 the conversion
  // silently rounds — a malicious or accidentally-large amount would write
  // a corrupted value to the DB. Throw early with a clear error instead;
  // the Zod schema is the first line of defence but this is belt + braces.
  if (c > BigInt(Number.MAX_SAFE_INTEGER) || c < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`centsToDbInt: bigint ${c.toString()} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(c);
}

/**
 * Maps a Postgres error to a typed Server Action result code.
 *
 * - 23505 unique_violation → DUPLICATE_ACTIVE (we only have one unique
 *   constraint in this scope: the partial idx on (user_id, category_id,
 *   period) WHERE active is true).
 * - 42501 / row-level security violation → CATEGORY_NOT_BUDGETABLE (the
 *   `with check` clause in the budgets policies fails when category_id is
 *   not owned by the user OR not of kind expense/saving). We do not
 *   distinguish "not yours" from "wrong kind" — both represent the same
 *   class of misuse from the API surface.
 * - everything else → DATABASE_ERROR.
 */
function mapBudgetWriteError(
  message: string,
  code?: string,
):
  | { error: 'DUPLICATE_ACTIVE' }
  | { error: 'CATEGORY_NOT_BUDGETABLE' }
  | { error: 'DATABASE_ERROR' } {
  // Postgres SQLSTATE 23505 = unique_violation. Supabase JS surfaces this in
  // PostgrestError.code. Fall back to message-substring sniffing so older
  // SDKs don't slip through.
  if (code === '23505' || /duplicate key|unique constraint/iu.test(message)) {
    return { error: 'DUPLICATE_ACTIVE' };
  }
  // 42501 = insufficient_privilege. Supabase tags RLS WITH CHECK failures
  // with this code (sometimes also as a generic message containing
  // "row-level security").
  if (code === '42501' || /row-level security|with check/iu.test(message)) {
    return { error: 'CATEGORY_NOT_BUDGETABLE' };
  }
  return { error: 'DATABASE_ERROR' };
}

function revalidateBudgetPaths(): void {
  revalidatePath('/budzeti');
  revalidatePath('/pocetna');
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * @public
 * Create a new monthly/weekly budget for one of the user's expense or
 * saving categories. The DB enforces that the category is owned by the
 * user AND budgetable (kind in expense/saving) via RLS WITH CHECK.
 */
export async function createBudget(input: unknown): Promise<CreateBudgetResult> {
  const parsed = CreateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildCreateBudgetErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { category_id, amount_cents, currency, period, rollover } = parsed.data;

  // SE-13: explicit ownership pre-check on category_id (was relying solely on
  // RLS WITH CHECK via user_owns_budgetable_category(category_id)). Defense
  // -in-depth — if RLS were ever misconfigured, the INSERT would be blocked here.
  const ownedCategory = await ensureOwnedCategory(supabase, user.id, category_id);
  if (!ownedCategory.ok) {
    return { success: false, error: ownedCategory.error };
  }

  const { data: row, error: insertErr } = await supabase
    .from('budgets')
    .insert({
      user_id: user.id,
      category_id,
      amount_cents: centsToDbInt(amount_cents),
      currency,
      period,
      rollover,
    })
    .select('id')
    .single();

  if (insertErr) {
    logSafe('create_budget_error', {
      userId: user.id,
      code: insertErr.code,
      error: insertErr.message,
    });
    const mapped = mapBudgetWriteError(insertErr.message, insertErr.code);
    return { success: false, ...mapped };
  }

  revalidateBudgetPaths();
  return { success: true, data: { id: row.id } };
}

/**
 * @public
 * Partial update of a budget. Performs an explicit ownership pre-check so
 * cross-user IDs return NOT_FOUND instead of leaking through to a no-op
 * RLS-filtered UPDATE that would silently succeed with 0 rows changed.
 */
export async function updateBudget(id: unknown, input: unknown): Promise<UpdateBudgetResult> {
  const idParse = BudgetIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = UpdateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildUpdateBudgetErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // BG-2: select carries the full budget so we can detect period change
  // (BG-1) and carry over unchanged fields when soft-archiving (BG-2).
  const { data: existing, error: selErr } = await supabase
    .from('budgets')
    .select('id, category_id, currency, amount_cents, period, rollover')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('update_budget_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;
  const periodChanging = p.period !== undefined && p.period !== existing.period;

  // BG-1: a period change must be accompanied by an explicit new
  // amount_cents. Auto-scaling 1000 KM/month → 1000 KM/week without
  // user input would silently mislead the spending baseline (the SQL
  // RPC `get_period_spent_for_category` compares against the budget's
  // current amount as-is). Push the conversion decision back to the UI.
  if (periodChanging && p.amount_cents === undefined) {
    return { success: false, error: 'PERIOD_CHANGE_REQUIRES_AMOUNT' };
  }

  // BG-2: when period changes, soft-archive the old row + insert a fresh
  // one. Two reasons:
  //   1. Preserves history — `get_period_spent_for_category` can still
  //      look back at "spending under last month's budget" by joining on
  //      the inactive row's period_started_at.
  //   2. Avoids an in-place update that would silently overwrite the
  //      semantic meaning of the row (same DB id, different period =
  //      different budget contract). The partial unique index
  //      `WHERE active = true` (migration 00053) lets us reuse the same
  //      (user, category, period) tuple by archiving the previous one
  //      first.
  if (periodChanging) {
    const { error: archiveErr } = await supabase
      .from('budgets')
      .update({ active: false })
      .eq('id', existing.id)
      .eq('user_id', user.id);
    if (archiveErr) {
      logSafe('update_budget_archive', {
        userId: user.id,
        code: archiveErr.code,
        error: archiveErr.message,
      });
      return { success: false, error: 'DATABASE_ERROR' };
    }

    const { error: insertErr } = await supabase.from('budgets').insert({
      user_id: user.id,
      category_id: p.category_id ?? existing.category_id,
      // p.amount_cents is guaranteed defined per BG-1 check above.
      amount_cents: centsToDbInt(p.amount_cents ?? 0n),
      currency: p.currency ?? existing.currency,
      period: p.period ?? existing.period,
      rollover: p.rollover ?? existing.rollover,
    });
    if (insertErr) {
      logSafe('update_budget_archive_insert', {
        userId: user.id,
        code: insertErr.code,
        error: insertErr.message,
      });
      const mapped = mapBudgetWriteError(insertErr.message, insertErr.code);
      return { success: false, ...mapped };
    }

    revalidateBudgetPaths();
    return { success: true };
  }

  // No period change: in-place UPDATE on the existing row.
  const patch: BudgetUpdate = {};
  if (p.category_id !== undefined) patch.category_id = p.category_id;
  if (p.amount_cents !== undefined) patch.amount_cents = centsToDbInt(p.amount_cents);
  if (p.currency !== undefined) patch.currency = p.currency;
  if (p.rollover !== undefined) patch.rollover = p.rollover;

  if (Object.keys(patch).length === 0) {
    revalidateBudgetPaths();
    return { success: true };
  }

  const { error: upErr } = await supabase
    .from('budgets')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('update_budget_error', {
      userId: user.id,
      code: upErr.code,
      error: upErr.message,
    });
    const mapped = mapBudgetWriteError(upErr.message, upErr.code);
    return { success: false, ...mapped };
  }

  revalidateBudgetPaths();
  return { success: true };
}

/**
 * @public
 * Toggle a budget's `active` flag. Going from active=false → active=true
 * may collide with the partial unique index if another active budget
 * already exists for the same (category, period); we surface that as
 * DUPLICATE_ACTIVE.
 */
export async function toggleBudgetActive(
  id: unknown,
  input: unknown,
): Promise<ToggleBudgetActiveResult> {
  const idParse = BudgetIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = ToggleBudgetActiveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(parsed.error)).errors },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: existing, error: selErr } = await supabase
    .from('budgets')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('toggle_budget_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: upErr } = await supabase
    .from('budgets')
    .update({ active: parsed.data.active })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('toggle_budget_error', {
      userId: user.id,
      code: upErr.code,
      error: upErr.message,
    });
    if (upErr.code === '23505' || /duplicate key|unique constraint/iu.test(upErr.message)) {
      return { success: false, error: 'DUPLICATE_ACTIVE' };
    }
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateBudgetPaths();
  return { success: true };
}

/**
 * @public
 * Hard delete a budget. There's no soft-delete pattern for budgets — they
 * are cheap, history is preserved by the `active=false` flag, and rolling
 * back a delete is not a use-case the UI surfaces.
 */
export async function deleteBudget(id: unknown): Promise<DeleteBudgetResult> {
  const idParse = BudgetIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: existing, error: selErr } = await supabase
    .from('budgets')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('delete_budget_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: delErr } = await supabase
    .from('budgets')
    .delete()
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('delete_budget_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateBudgetPaths();
  return { success: true };
}
