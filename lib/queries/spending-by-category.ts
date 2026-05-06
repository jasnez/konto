/**
 * Spending-by-category query helper. Wraps the `get_spending_by_category`
 * RPC and converts cents fields (single + array) to bigint so callers can
 * stay in cents arithmetic without precision loss.
 *
 * Used by:
 *   - dashboard "Pulse Donut" widget on /pocetna
 *   - dedicated /potrosnja page (period toggle)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

export type SpendingPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface CategorySpendRow {
  /** NULL = "Nerazvrstano" (uncategorised) bucket. */
  categoryId: string | null;
  name: string;
  icon: string;
  color: string | null;
  slug: string;
  amountCents: bigint;
  prevAmountCents: bigint;
  /** Length 12, oldest → newest, ending with the current calendar month. */
  monthlyHistory: bigint[];
}

export type SpendingSupabaseClient = Pick<SupabaseClient<Database>, 'rpc'>;

interface RpcRow {
  category_id: string | null;
  category_name: string;
  category_icon: string;
  category_color: string | null;
  category_slug: string;
  amount_cents: number | string | bigint | null;
  prev_amount_cents: number | string | bigint | null;
  monthly_history: (number | string | bigint)[] | null;
}

const HISTORY_LENGTH = 12;
const ZERO_HISTORY: bigint[] = Array.from({ length: HISTORY_LENGTH }, () => 0n);

function toBigInt(v: number | string | bigint | null | undefined): bigint {
  if (v === null || v === undefined) return 0n;
  if (typeof v === 'bigint') return v;
  return BigInt(v);
}

/**
 * Fetch spending broken down by category for the given period window.
 *
 * Sorted by amount desc inside the RPC. Includes a separate row for
 * uncategorised transactions (categoryId === null).
 */
export async function getSpendingByCategory(
  supabase: SpendingSupabaseClient,
  options: {
    period: SpendingPeriod;
    offset?: number;
    baseCurrency: string;
    todayDate: string;
  },
): Promise<CategorySpendRow[]> {
  const { data, error } = await supabase.rpc('get_spending_by_category', {
    p_period: options.period,
    p_offset: options.offset ?? 0,
    p_base_currency: options.baseCurrency,
    p_today_date: options.todayDate,
  });

  if (error) {
    logSafe('get_spending_by_category_rpc', {
      period: options.period,
      offset: options.offset ?? 0,
      error: error.message,
    });
    return [];
  }

  const rows = data as unknown as RpcRow[];

  return rows.map<CategorySpendRow>((r) => {
    const history = r.monthly_history;
    const monthlyHistory = history === null ? ZERO_HISTORY.slice() : history.map(toBigInt);
    // Defensive: if RPC ever returns the wrong length, pad/trim to 12 so
    // sparkline renderers don't blow up on length assumptions.
    if (monthlyHistory.length < HISTORY_LENGTH) {
      while (monthlyHistory.length < HISTORY_LENGTH) monthlyHistory.unshift(0n);
    } else if (monthlyHistory.length > HISTORY_LENGTH) {
      monthlyHistory.splice(0, monthlyHistory.length - HISTORY_LENGTH);
    }

    return {
      categoryId: r.category_id,
      name: r.category_name,
      icon: r.category_icon,
      color: r.category_color,
      slug: r.category_slug,
      amountCents: toBigInt(r.amount_cents),
      prevAmountCents: toBigInt(r.prev_amount_cents),
      monthlyHistory,
    };
  });
}
