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

  const { data: existing, error: selErr } = await supabase
    .from('budgets')
    .select('id')
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
  const patch: BudgetUpdate = {};
  if (p.category_id !== undefined) patch.category_id = p.category_id;
  if (p.amount_cents !== undefined) patch.amount_cents = centsToDbInt(p.amount_cents);
  if (p.currency !== undefined) patch.currency = p.currency;
  if (p.period !== undefined) patch.period = p.period;
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
