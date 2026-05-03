'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  AddContributionSchema,
  CreateGoalSchema,
  GoalIdParamSchema,
  LinkAccountSchema,
  UpdateGoalSchema,
} from '@/lib/goals/validation';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

type GoalUpdate = Database['public']['Tables']['goals']['Update'];

// ─── Error tree helpers ───────────────────────────────────────────────────────

interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
}

function asErrorTree<T>(t: z.core.$ZodErrorTree<T>): ZodErrorTree {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return t as unknown as ZodErrorTree;
}

function buildCreateGoalErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    name: t.properties?.name?.errors,
    target_amount_cents: t.properties?.target_amount_cents?.errors,
    currency: t.properties?.currency?.errors,
    target_date: t.properties?.target_date?.errors,
    account_id: t.properties?.account_id?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
    _root: t.errors,
  };
}

function buildUpdateGoalErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    name: t.properties?.name?.errors,
    target_amount_cents: t.properties?.target_amount_cents?.errors,
    currency: t.properties?.currency?.errors,
    target_date: t.properties?.target_date?.errors,
    account_id: t.properties?.account_id?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
    active: t.properties?.active?.errors,
    _root: t.errors,
  };
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type CreateGoalResult =
  | { success: true; data: { id: string } }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildCreateGoalErrorDetails>;
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'ACCOUNT_NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type UpdateGoalResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildUpdateGoalErrorDetails> | { _root: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'ACCOUNT_NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type AddContributionResult =
  | {
      success: true;
      data: {
        /** Serialised bigint string — safe across RSC boundary. */
        currentCents: string;
        /** True if this contribution pushed current >= target for the first time. */
        justAchieved: boolean;
      };
    }
  | { success: false; error: 'VALIDATION_ERROR'; details: { amount_cents?: string[]; _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type DeleteGoalResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type LinkAccountResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'ACCOUNT_NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToDbInt(c: bigint): number {
  return Number(c);
}

function revalidateGoalPaths(id?: string): void {
  revalidatePath('/ciljevi');
  revalidatePath('/pocetna');
  if (id) revalidatePath(`/ciljevi/${id}`);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * @public
 * Create a new savings goal. If `account_id` is provided, the goal's
 * `current_amount_cents` is immediately synced from that account's live
 * balance via the `recompute_goal_from_account` RPC.
 */
export async function createGoal(input: unknown): Promise<CreateGoalResult> {
  const parsed = CreateGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildCreateGoalErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { name, target_amount_cents, currency, target_date, account_id, icon, color } =
    parsed.data;

  // If an account is being linked, verify it belongs to this user before
  // writing the goal row. This prevents inserting a goal with a foreign
  // account_id that would pass the FK constraint but fail the recompute RPC
  // silently (the RPC would just no-op rather than error).
  if (account_id) {
    const { data: acct, error: acctErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (acctErr) {
      logSafe('create_goal_account_check', { userId: user.id, error: acctErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!acct) {
      return { success: false, error: 'ACCOUNT_NOT_FOUND' };
    }
  }

  const { data: row, error: insertErr } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      name,
      target_amount_cents: centsToDbInt(target_amount_cents),
      currency,
      target_date: target_date ?? null,
      account_id: account_id ?? null,
      icon: icon ?? null,
      color: color ?? null,
    })
    .select('id')
    .single();

  if (insertErr) {
    logSafe('create_goal_error', {
      userId: user.id,
      code: insertErr.code,
      error: insertErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // If linked to an account, sync current balance immediately so the UI shows
  // a non-zero starting point right away.
  if (account_id) {
    const { error: rpcErr } = await supabase.rpc('recompute_goal_from_account', {
      p_goal_id: row.id,
    });
    if (rpcErr) {
      // Non-fatal: goal is created, balance sync failed. Log and carry on.
      logSafe('create_goal_recompute', { userId: user.id, goalId: row.id, error: rpcErr.message });
    }
  }

  revalidateGoalPaths();
  return { success: true, data: { id: row.id } };
}

/**
 * @public
 * Partial update of a goal. Performs an explicit ownership pre-check so
 * cross-user IDs return NOT_FOUND rather than leaking through to a no-op
 * RLS-filtered UPDATE.
 *
 * If `account_id` changes to a new UUID, the action verifies that account
 * belongs to the user before writing. After writing, if account_id is set,
 * `recompute_goal_from_account` is called to re-sync `current_amount_cents`.
 */
export async function updateGoal(id: unknown, input: unknown): Promise<UpdateGoalResult> {
  const idParse = GoalIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = UpdateGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildUpdateGoalErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // Ownership pre-check — also fetch current account_id so we know whether
  // account linkage is about to change.
  const { data: existing, error: selErr } = await supabase
    .from('goals')
    .select('id, account_id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('update_goal_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;

  // If a new account is being linked, verify ownership before writing.
  if (p.account_id !== undefined && p.account_id !== null) {
    const { data: acct, error: acctErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', p.account_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (acctErr) {
      logSafe('update_goal_account_check', { userId: user.id, error: acctErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!acct) {
      return { success: false, error: 'ACCOUNT_NOT_FOUND' };
    }
  }

  // Build patch — only include fields that were explicitly provided.
  const patch: GoalUpdate = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.target_amount_cents !== undefined)
    patch.target_amount_cents = centsToDbInt(p.target_amount_cents);
  if (p.currency !== undefined) patch.currency = p.currency;
  if ('target_date' in p) patch.target_date = p.target_date ?? null;
  if ('account_id' in p) patch.account_id = p.account_id ?? null;
  if ('icon' in p) patch.icon = p.icon ?? null;
  if ('color' in p) patch.color = p.color ?? null;
  if (p.active !== undefined) patch.active = p.active;

  if (Object.keys(patch).length === 0) {
    revalidateGoalPaths(idParse.data);
    return { success: true };
  }

  const { error: upErr } = await supabase
    .from('goals')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('update_goal_error', {
      userId: user.id,
      code: upErr.code,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Re-sync balance if account_id is set (either newly linked or was already
  // linked and some other field changed that warrants a refresh).
  const effectiveAccountId = 'account_id' in p ? (p.account_id ?? null) : existing.account_id;
  if (effectiveAccountId) {
    const { error: rpcErr } = await supabase.rpc('recompute_goal_from_account', {
      p_goal_id: idParse.data,
    });
    if (rpcErr) {
      logSafe('update_goal_recompute', {
        userId: user.id,
        goalId: idParse.data,
        error: rpcErr.message,
      });
      // Non-fatal — goal was updated, balance sync is best-effort.
    }
  }

  revalidateGoalPaths(idParse.data);
  return { success: true };
}

/**
 * @public
 * Increment a goal's `current_amount_cents` by `amount_cents`.
 *
 * Returns `justAchieved: true` if this contribution pushed `current` past
 * `target` for the first time (i.e., `achieved_at` transitioned null →
 * non-null). The UI uses this flag to trigger a confetti celebration.
 *
 * Note: addContribution works regardless of whether the goal has a linked
 * account. If linked, `recompute_goal_from_account` can overwrite the value
 * later. The two flows are independent.
 */
export async function addContribution(
  id: unknown,
  input: unknown,
): Promise<AddContributionResult> {
  const idParse = GoalIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = AddContributionSchema.safeParse(input);
  if (!parsed.success) {
    const t = asErrorTree(z.treeifyError(parsed.error));
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        amount_cents: t.properties?.amount_cents?.errors,
        _root: t.errors,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // Ownership pre-check + fetch current state for read-then-write and
  // `justAchieved` detection.
  const { data: goal, error: selErr } = await supabase
    .from('goals')
    .select('id, current_amount_cents, achieved_at')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('add_contribution_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!goal) {
    return { success: false, error: 'NOT_FOUND' };
  }

  // Supabase JS surfaces bigint columns as number | string; normalise.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const oldCurrent = goal.current_amount_cents != null ? BigInt(goal.current_amount_cents) : 0n;
  const wasAchieved = goal.achieved_at !== null;
  const newCurrent = oldCurrent + parsed.data.amount_cents;

  // Write new value and read back achieved_at (set by DB trigger).
  const { data: updated, error: upErr } = await supabase
    .from('goals')
    .update({ current_amount_cents: centsToDbInt(newCurrent) })
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .select('current_amount_cents, achieved_at')
    .single();

  if (upErr) {
    logSafe('add_contribution_update', {
      userId: user.id,
      goalId: idParse.data,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const finalCurrent = BigInt(updated.current_amount_cents);
  const nowAchieved = updated.achieved_at !== null;
  const justAchieved = !wasAchieved && nowAchieved;

  revalidateGoalPaths(idParse.data);
  return {
    success: true,
    data: { currentCents: finalCurrent.toString(), justAchieved },
  };
}

/**
 * @public
 * Hard-delete a goal. No soft-delete: the goal list is short and there is no
 * "undo" use-case in the UI. History can be derived from transactions if needed.
 */
export async function deleteGoal(id: unknown): Promise<DeleteGoalResult> {
  const idParse = GoalIdParamSchema.safeParse(id);
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
    .from('goals')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('delete_goal_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: delErr } = await supabase
    .from('goals')
    .delete()
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('delete_goal_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateGoalPaths();
  return { success: true };
}

/**
 * @public
 * Link (or unlink) a savings account to a goal.
 *
 * When `account_id` is a UUID:
 *   1. Verifies the account belongs to the authenticated user.
 *   2. Sets `goals.account_id`.
 *   3. Calls `recompute_goal_from_account` to sync `current_amount_cents`
 *      from the account's live balance immediately.
 *
 * When `account_id` is null:
 *   Clears the link. `current_amount_cents` is NOT reset — it stays at
 *   whatever value it had so the user doesn't lose their progress display.
 */
export async function linkAccount(id: unknown, input: unknown): Promise<LinkAccountResult> {
  const idParse = GoalIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = LinkAccountSchema.safeParse(input);
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

  // Goal ownership pre-check.
  const { data: existing, error: selErr } = await supabase
    .from('goals')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('link_account_goal_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { account_id } = parsed.data;

  // If linking, verify the account belongs to the user.
  if (account_id !== null) {
    const { data: acct, error: acctErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (acctErr) {
      logSafe('link_account_account_select', { userId: user.id, error: acctErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!acct) {
      return { success: false, error: 'ACCOUNT_NOT_FOUND' };
    }
  }

  const { error: upErr } = await supabase
    .from('goals')
    .update({ account_id })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('link_account_update', {
      userId: user.id,
      goalId: idParse.data,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Sync balance after linking.
  if (account_id !== null) {
    const { error: rpcErr } = await supabase.rpc('recompute_goal_from_account', {
      p_goal_id: idParse.data,
    });
    if (rpcErr) {
      logSafe('link_account_recompute', {
        userId: user.id,
        goalId: idParse.data,
        error: rpcErr.message,
      });
      // Non-fatal — link was set, balance sync is best-effort.
    }
  }

  revalidateGoalPaths(idParse.data);
  return { success: true };
}
