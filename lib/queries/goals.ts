/**
 * Goals query helpers.
 *
 * `listGoals` returns goals with progress computed client-side from
 * `current_amount_cents / target_amount_cents`.
 *
 * Used by the /ciljevi list page (T2) and potentially a dashboard widget.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

export type GoalsSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

/** Full goal item as returned to the UI layer. */
export interface GoalItem {
  id: string;
  name: string;
  targetAmountCents: bigint;
  currentAmountCents: bigint;
  currency: string;
  targetDate: string | null;
  accountId: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 0–1 ratio of current / target (capped at 1). 0 when target is 0 (defensive). */
  progress: number;
  /** Linked account name, if any. */
  accountName: string | null;
  /** Recommended monthly contribution to hit target_date on time.
   *  Null if no target_date or already achieved. */
  recommendedMonthlyCents: bigint | null;
  /** Number of whole months left until target_date (0 if past or no date). */
  monthsLeft: number | null;
}

interface GoalRowRaw {
  id: string;
  name: string;
  target_amount_cents: number;
  current_amount_cents: number;
  currency: string;
  target_date: string | null;
  account_id: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
  account: { id: string; name: string } | null;
}

/**
 * Returns months remaining until `targetDate` from `today` (inclusive of
 * current month). Returns 0 for past dates.
 */
function monthsUntil(targetDate: string, today: Date): number {
  const target = new Date(targetDate);
  const diff =
    (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  return Math.max(0, diff);
}

/**
 * Compute recommended monthly savings amount to reach the target on time.
 * Returns null if already achieved, no target date, or remaining months is 0.
 */
function computeRecommendedMonthly(
  currentCents: bigint,
  targetCents: bigint,
  targetDate: string | null,
  today: Date,
): { recommendedMonthlyCents: bigint | null; monthsLeft: number | null } {
  if (!targetDate) return { recommendedMonthlyCents: null, monthsLeft: null };
  if (currentCents >= targetCents) return { recommendedMonthlyCents: null, monthsLeft: 0 };
  const months = monthsUntil(targetDate, today);
  if (months === 0) return { recommendedMonthlyCents: null, monthsLeft: 0 };
  const remaining = targetCents - currentCents;
  // Round up to the nearest cent so the user always reaches target.
  const recommended = (remaining + BigInt(months) - 1n) / BigInt(months);
  return { recommendedMonthlyCents: recommended, monthsLeft: months };
}

/**
 * List all goals for a user, optionally filtered to active only.
 * Sorted: active goals first, then achieved goals, then archived — within
 * each group by created_at DESC.
 */
export async function listGoals(
  supabase: GoalsSupabaseClient,
  userId: string,
  options: { onlyActive?: boolean; today?: Date } = {},
): Promise<GoalItem[]> {
  const today = options.today ?? new Date();

  let q = supabase
    .from('goals')
    .select(
      `id, name, target_amount_cents, current_amount_cents, currency,
       target_date, account_id, icon, color, active, achieved_at,
       created_at, updated_at,
       account:accounts(id, name)`,
    )
    .eq('user_id', userId)
    // active goals first; within each group newest first
    .order('active', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.onlyActive) {
    q = q.eq('active', true);
  }

  const { data, error } = await q;
  if (error) {
    logSafe('list_goals_select', { userId, error: error.message });
    return [];
  }

  const rows = data as unknown as GoalRowRaw[];

  return rows.map((r) => {
    // Supabase JS may surface bigint columns as number | string.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const current = r.current_amount_cents != null ? BigInt(r.current_amount_cents) : 0n;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const target = r.target_amount_cents != null ? BigInt(r.target_amount_cents) : 1n;
    const progress = target === 0n ? 0 : Math.min(1, Number(current) / Number(target));
    const { recommendedMonthlyCents, monthsLeft } = computeRecommendedMonthly(
      current,
      target,
      r.target_date,
      today,
    );
    // Supabase join returns array or object depending on cardinality.
    // We use accounts (singular join) which returns an object or null.
    const accountRaw = r.account as
      | { id: string; name: string }
      | null
      | { id: string; name: string }[];
    const account = Array.isArray(accountRaw) ? (accountRaw[0] ?? null) : accountRaw;

    return {
      id: r.id,
      name: r.name,
      targetAmountCents: target,
      currentAmountCents: current,
      currency: r.currency,
      targetDate: r.target_date,
      accountId: r.account_id,
      icon: r.icon,
      color: r.color,
      active: r.active,
      achievedAt: r.achieved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      progress,
      accountName: account?.name ?? null,
      recommendedMonthlyCents,
      monthsLeft,
    };
  });
}
