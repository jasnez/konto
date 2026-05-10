/**
 * Budget query helpers.
 *
 * `listBudgetsWithSpent` joins `budgets` with the user's owned categories
 * and calls `get_current_period_spent` per row. Used by the /budzeti list
 * page (T3) and the dashboard widget (T4).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

export type BudgetsSupabaseClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

/** Single transaction row for the budget detail page. */
export interface BudgetTransactionRow {
  id: string;
  transactionDate: string;
  description: string | null;
  merchantRaw: string | null;
  originalAmountCents: number;
  originalCurrency: string;
}

/** Subset of `budgets` row + denormalised category meta + computed spend. */
export interface BudgetWithProgress {
  id: string;
  amountCents: bigint;
  currency: string;
  period: 'monthly' | 'weekly';
  active: boolean;
  rollover: boolean;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
    kind: string;
  };
  /** Sum of |base_amount_cents| in current period. 0 if user has no
   *  matching transactions yet, or if the budget is inactive. */
  spentCents: bigint;
  /** spent / amount as a 0..1 ratio, clamped. 0 when amount is 0 (defensive). */
  progress: number;
  /** Days remaining in the current period (0..30 for monthly, 0..7 for weekly). */
  daysLeft: number;
}

interface BudgetRowRaw {
  id: string;
  amount_cents: number;
  currency: string;
  period: string;
  active: boolean;
  rollover: boolean;
  created_at: string;
  updated_at: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
    kind: string;
  } | null;
}

/** Inclusive end-of-period delta in days from `today`. */
function daysLeftInPeriod(period: 'monthly' | 'weekly', today: Date): number {
  if (period === 'weekly') {
    // ISO week: Monday = 1, Sunday = 7.
    const day = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
    return 7 - day;
  }
  // Monthly: days until last day of this month.
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(next.getTime() - 1);
  return Math.max(0, Math.floor((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * List all of the user's budgets (active or not) with their current-period
 * spend already computed. Sorted active-first, then by created_at desc.
 *
 * The RPC `get_current_period_spent` is called once per budget. For the
 * 5–20 budgets a typical user has this is fine; if/when this becomes a
 * hotspot we can switch to a single RPC that returns all budgets+spend
 * as JSONB (mirror of get_monthly_summary).
 */
export async function listBudgetsWithSpent(
  supabase: BudgetsSupabaseClient,
  userId: string,
  options: { onlyActive?: boolean; today?: Date } = {},
): Promise<BudgetWithProgress[]> {
  const today = options.today ?? new Date();

  let q = supabase
    .from('budgets')
    .select(
      `id, amount_cents, currency, period, active, rollover, created_at, updated_at,
       category:categories!inner (id, name, slug, icon, color, kind)`,
    )
    .eq('user_id', userId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.onlyActive) {
    q = q.eq('active', true);
  }

  const { data, error } = await q;
  if (error) {
    logSafe('list_budgets_select', { userId, error: error.message });
    return [];
  }

  const rows = data as unknown as BudgetRowRaw[];

  // Resolve spent per row in parallel — RPCs are cheap, RLS-scoped, and
  // 20× round-trips are still well under the dashboard SLA.
  const spentByBudget = await Promise.all(
    rows.map((r) => fetchSpentForBudget(supabase, r.id, r.active)),
  );

  const out: BudgetWithProgress[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const cat = r.category;
    if (cat == null) continue;
    const amount = BigInt(r.amount_cents);
    const spent = spentByBudget[i] ?? 0n;
    const progress = amount === 0n ? 0 : Number(spent) / Number(amount);
    const period: 'monthly' | 'weekly' = r.period === 'weekly' ? 'weekly' : 'monthly';
    out.push({
      id: r.id,
      amountCents: amount,
      currency: r.currency,
      period,
      active: r.active,
      rollover: r.rollover,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      category: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        color: cat.color,
        kind: cat.kind,
      },
      spentCents: spent,
      progress: Math.max(0, Math.min(progress, 99)), // cap UI-side; raw ratio still useful
      daysLeft: r.active ? daysLeftInPeriod(period, today) : 0,
    });
  }
  return out;
}

async function fetchSpentForBudget(
  supabase: BudgetsSupabaseClient,
  budgetId: string,
  active: boolean,
): Promise<bigint> {
  if (!active) return 0n;
  const { data, error } = await supabase.rpc('get_current_period_spent', {
    p_budget_id: budgetId,
  });
  if (error) {
    logSafe('get_current_period_spent_rpc', {
      budgetId,
      error: error.message,
    });
    return 0n;
  }
  // RPC returns bigint; supabase-js surfaces it as number | string.
  // Defensive: BigInt() on `null`/`undefined` throws, so coerce both to 0.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (data === null || data === undefined) return 0n;
  return BigInt(data);
}

/**
 * Fetch a single budget by id with current-period spend computed. Returns
 * `null` if the budget doesn't exist, doesn't belong to the user, or has no
 * joinable category. Mirrors the per-row shape produced by
 * `listBudgetsWithSpent` so the same UI helpers can render it.
 */
export async function getBudgetById(
  supabase: BudgetsSupabaseClient,
  userId: string,
  budgetId: string,
  options: { today?: Date } = {},
): Promise<BudgetWithProgress | null> {
  const today = options.today ?? new Date();

  const { data, error } = await supabase
    .from('budgets')
    .select(
      `id, amount_cents, currency, period, active, rollover, created_at, updated_at,
       category:categories!inner (id, name, slug, icon, color, kind)`,
    )
    .eq('id', budgetId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logSafe('get_budget_by_id_select', { userId, budgetId, error: error.message });
    return null;
  }
  if (data == null) return null;

  const row = data as unknown as BudgetRowRaw;
  const cat = row.category;
  if (cat == null) return null;

  const spent = await fetchSpentForBudget(supabase, row.id, row.active);
  const amount = BigInt(row.amount_cents);
  const progress = amount === 0n ? 0 : Number(spent) / Number(amount);
  const period: 'monthly' | 'weekly' = row.period === 'weekly' ? 'weekly' : 'monthly';

  return {
    id: row.id,
    amountCents: amount,
    currency: row.currency,
    period,
    active: row.active,
    rollover: row.rollover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      kind: cat.kind,
    },
    spentCents: spent,
    progress: Math.max(0, Math.min(progress, 99)),
    daysLeft: row.active ? daysLeftInPeriod(period, today) : 0,
  };
}

/**
 * Compute the current-period [start, end) range that mirrors
 * `get_current_period_spent` SQL: monthly = [first of month, first of next),
 * weekly = [Monday, +7 days). All in UTC to match Postgres' default TZ.
 *
 * Returned as YYYY-MM-DD strings since `transactions.transaction_date` is a
 * DATE column.
 */
function currentPeriodRange(
  period: 'monthly' | 'weekly',
  today: Date,
): { startIso: string; endIso: string } {
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  let start: Date;
  let end: Date;
  if (period === 'monthly') {
    start = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), 1));
    end = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth() + 1, 1));
  } else {
    // ISO week: Mon=1..Sun=7. Postgres date_trunc('week') returns Monday.
    const isoDow = utcToday.getUTCDay() === 0 ? 7 : utcToday.getUTCDay();
    start = new Date(utcToday);
    start.setUTCDate(utcToday.getUTCDate() - (isoDow - 1));
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
  }

  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

/**
 * List the transactions that contribute to a budget's current-period spend.
 * Filters mirror `get_current_period_spent` SQL exactly so the sum of rows
 * here equals the `spentCents` shown on the card / detail header.
 *
 * Returns `[]` for inactive budgets (matches the RPC's "history view should
 * not show fresh spent numbers" stance) so the empty state communicates the
 * same thing the 0-progress header does.
 */
export async function listBudgetTransactionsForCurrentPeriod(
  supabase: BudgetsSupabaseClient,
  userId: string,
  budget: { categoryId: string; period: 'monthly' | 'weekly'; active: boolean },
  options: { today?: Date; limit?: number } = {},
): Promise<BudgetTransactionRow[]> {
  if (!budget.active) return [];

  const today = options.today ?? new Date();
  const limit = options.limit ?? 200;
  const { startIso, endIso } = currentPeriodRange(budget.period, today);

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, transaction_date, description, merchant_raw, original_amount_cents, original_currency',
    )
    .eq('user_id', userId)
    .eq('category_id', budget.categoryId)
    .gte('transaction_date', startIso)
    .lt('transaction_date', endIso)
    .eq('is_excluded', false)
    .eq('is_transfer', false)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    logSafe('list_budget_transactions_select', {
      userId,
      categoryId: budget.categoryId,
      error: error.message,
    });
    return [];
  }

  return data.map((r) => ({
    id: r.id,
    transactionDate: r.transaction_date,
    description: r.description,
    merchantRaw: r.merchant_raw,
    originalAmountCents: r.original_amount_cents,
    originalCurrency: r.original_currency,
  }));
}
