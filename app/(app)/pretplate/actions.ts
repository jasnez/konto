'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  BindTransactionSchema,
  ConfirmRecurringSchema,
  EditRecurringSchema,
  PauseRecurringSchema,
  RecurringIdParamSchema,
} from '@/lib/recurring/validation';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

type RecurringUpdate = Database['public']['Tables']['recurring_transactions']['Update'];

interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
}

function asErrorTree<T>(t: z.core.$ZodErrorTree<T>): ZodErrorTree {
  // Same trick as budgets/actions.ts — Zod tree shape is structurally
  // compatible with our local type, but TS + eslint can't quite see it.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return t as unknown as ZodErrorTree;
}

// ─── Result types ────────────────────────────────────────────────────────────

export type ConfirmRecurringResult =
  | { success: true; data: { id: string } }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'REFERENCED_NOT_OWNED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type EditRecurringResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'REFERENCED_NOT_OWNED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type PauseRecurringResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type CancelRecurringResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type BindTransactionResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Postgres → Server Action error mapping.
 *
 * - 42501 / "row-level security" message → REFERENCED_NOT_OWNED. The
 *   only WITH CHECK clauses on recurring_transactions reject foreign
 *   merchant/category/account references; the user_id check itself is
 *   server-derived so it never trips.
 * - everything else → DATABASE_ERROR. Raw messages stay in server logs
 *   only via logSafe; the client only ever sees enum codes.
 */
function mapWriteError(
  message: string,
  code?: string,
): { error: 'REFERENCED_NOT_OWNED' } | { error: 'DATABASE_ERROR' } {
  if (code === '42501' || /row-level security|with check/iu.test(message)) {
    return { error: 'REFERENCED_NOT_OWNED' };
  }
  return { error: 'DATABASE_ERROR' };
}

function revalidateRecurringPaths(): void {
  revalidatePath('/pretplate');
  revalidatePath('/pocetna');
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * @public
 * Confirm a detector candidate (or a manually-built one) into a
 * persisted recurring row, AND back-fill recurring_group_id on every
 * supplied transaction id. Both writes happen inside the
 * `confirm_recurring` RPC so they're transactional — a partial confirm
 * is impossible.
 */
export async function confirmRecurring(input: unknown): Promise<ConfirmRecurringResult> {
  const parsed = ConfirmRecurringSchema.safeParse(input);
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

  // Build the JSON payload the RPC expects. Bigints stay as decimal
  // strings to survive the JSONB cast on the SQL side.
  const payload = {
    merchantId: parsed.data.merchantId,
    categoryId: parsed.data.categoryId,
    accountId: parsed.data.accountId,
    description: parsed.data.description,
    period: parsed.data.period,
    averageAmountCents: parsed.data.averageAmountCents,
    currency: parsed.data.currency,
    lastSeen: parsed.data.lastSeen,
    nextExpected: parsed.data.nextExpected,
    confidence: parsed.data.confidence ?? null,
    occurrences: parsed.data.occurrences,
    transactionIds: parsed.data.transactionIds,
  };

  const { data, error } = await supabase.rpc('confirm_recurring', { p_payload: payload });
  if (error) {
    logSafe('confirm_recurring_error', {
      userId: user.id,
      code: error.code,
      error: error.message,
    });
    const mapped = mapWriteError(error.message, error.code);
    return { success: false, ...mapped };
  }

  // RPC returns { id: '<uuid>' } as jsonb.
  const id =
    data && typeof data === 'object' && 'id' in data && typeof data.id === 'string'
      ? data.id
      : null;
  if (!id) {
    logSafe('confirm_recurring_no_id', { userId: user.id });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateRecurringPaths();
  return { success: true, data: { id } };
}

/**
 * @public
 * Partial edit. Description, period, amount, currency, next-expected,
 * and the three FK-y fields can change. Time-snapshot fields
 * (`occurrences`, `last_seen_date`) are intentionally NOT editable —
 * they reflect the underlying transaction history.
 */
export async function editRecurring(id: unknown, input: unknown): Promise<EditRecurringResult> {
  const idParse = RecurringIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = EditRecurringSchema.safeParse(input);
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

  // Ownership pre-check — surfaces NOT_FOUND for cross-user ids without
  // leaking through to a no-op RLS-filtered UPDATE that would silently
  // succeed with 0 rows changed.
  const { data: existing, error: selErr } = await supabase
    .from('recurring_transactions')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) {
    logSafe('edit_recurring_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;
  const patch: RecurringUpdate = {};
  if (p.description !== undefined) patch.description = p.description;
  if (p.period !== undefined) patch.period = p.period;
  if (p.averageAmountCents !== undefined) {
    patch.average_amount_cents = Number(BigInt(p.averageAmountCents));
  }
  if (p.currency !== undefined) patch.currency = p.currency;
  if (p.nextExpectedDate !== undefined) patch.next_expected_date = p.nextExpectedDate;
  if (p.merchantId !== undefined) patch.merchant_id = p.merchantId;
  if (p.categoryId !== undefined) patch.category_id = p.categoryId;
  if (p.accountId !== undefined) patch.account_id = p.accountId;

  if (Object.keys(patch).length === 0) {
    revalidateRecurringPaths();
    return { success: true };
  }

  const { error: upErr } = await supabase
    .from('recurring_transactions')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('edit_recurring_error', {
      userId: user.id,
      code: upErr.code,
      error: upErr.message,
    });
    const mapped = mapWriteError(upErr.message, upErr.code);
    return { success: false, ...mapped };
  }

  revalidateRecurringPaths();
  return { success: true };
}

/**
 * @public
 * Pause until a date. We keep `active=true` and set `paused_until` so
 * the row remains in the active list but the UI renders "Pauzirano do …"
 * until the date passes. Auto-resume is intentional — no cron needed,
 * read-time `paused_until > now()` filter is enough.
 */
export async function pauseRecurring(id: unknown, input: unknown): Promise<PauseRecurringResult> {
  const idParse = RecurringIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = PauseRecurringSchema.safeParse(input);
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
    .from('recurring_transactions')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) {
    logSafe('pause_recurring_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: upErr } = await supabase
    .from('recurring_transactions')
    .update({ paused_until: parsed.data.until, active: true })
    .eq('id', idParse.data)
    .eq('user_id', user.id);
  if (upErr) {
    logSafe('pause_recurring_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateRecurringPaths();
  return { success: true };
}

/**
 * @public
 * Hard cancel. Sets active=false and clears paused_until. The row stays
 * around for analytics/history; full delete is not exposed today (would
 * orphan history transactions, even though the FK is ON DELETE SET NULL).
 */
export async function cancelRecurring(id: unknown): Promise<CancelRecurringResult> {
  const idParse = RecurringIdParamSchema.safeParse(id);
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
    .from('recurring_transactions')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) {
    logSafe('cancel_recurring_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: upErr } = await supabase
    .from('recurring_transactions')
    .update({ active: false, paused_until: null })
    .eq('id', idParse.data)
    .eq('user_id', user.id);
  if (upErr) {
    logSafe('cancel_recurring_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateRecurringPaths();
  return { success: true };
}

/**
 * @public
 * Manually link a single existing transaction to a recurring row. Used
 * by the T3 "Veži ovu transakciju" affordance when the user spots a
 * stray recurring charge the auto-detector missed.
 */
export async function bindTransactionToRecurring(
  recurringId: unknown,
  input: unknown,
): Promise<BindTransactionResult> {
  const idParse = RecurringIdParamSchema.safeParse(recurringId);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = BindTransactionSchema.safeParse(input);
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

  // Both ownership pre-checks first — recurring + transaction. RLS
  // would catch cross-user ids anyway, but failing fast here gives the
  // UI a clear NOT_FOUND.
  const { data: rec, error: rErr } = await supabase
    .from('recurring_transactions')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (rErr) {
    logSafe('bind_tx_recurring_select', { userId: user.id, error: rErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!rec) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { data: tx, error: tErr } = await supabase
    .from('transactions')
    .select('id')
    .eq('id', parsed.data.transactionId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (tErr) {
    logSafe('bind_tx_select', { userId: user.id, error: tErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!tx) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: upErr } = await supabase
    .from('transactions')
    .update({ recurring_group_id: idParse.data, is_recurring: true })
    .eq('id', parsed.data.transactionId)
    .eq('user_id', user.id);
  if (upErr) {
    logSafe('bind_tx_update', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateRecurringPaths();
  return { success: true };
}
