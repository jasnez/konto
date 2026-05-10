/**
 * Read-side helpers for recurring (pretplate) data.
 *
 * `listActiveRecurring` is the workhorse for the /pretplate page
 * and the dashboard widget (future). `monthlyEquivalentCents` does the
 * frequency normalisation the UI footer needs for the "Mjesečni
 * ekvivalent svih pretplata" line.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';
import type { RecurringPeriod } from '@/lib/analytics/recurring-detection';

export type RecurringSupabaseClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

export interface ActiveRecurring {
  id: string;
  description: string;
  period: RecurringPeriod;
  averageAmountCents: bigint;
  currency: string;
  nextExpectedDate: string | null;
  lastSeenDate: string | null;
  pausedUntil: string | null;
  /** Server-derived: paused_until is in the future and active=true. */
  isPaused: boolean;
  detectionConfidence: number | null;
  occurrences: number;
  merchantId: string | null;
  categoryId: string | null;
  accountId: string | null;
  /** Joined; null when the merchant/category/account was deleted. */
  merchantName: string | null;
  categoryName: string | null;
  accountName: string | null;
  createdAt: string;
}

interface RawRecurringRow {
  id: string;
  description: string;
  period: string;
  average_amount_cents: number;
  currency: string;
  next_expected_date: string | null;
  last_seen_date: string | null;
  paused_until: string | null;
  detection_confidence: number | string | null;
  occurrences: number;
  merchant_id: string | null;
  category_id: string | null;
  account_id: string | null;
  created_at: string;
  merchants: { display_name: string | null } | null;
  categories: { name: string | null } | null;
  accounts: { name: string | null } | null;
}

const KNOWN_PERIODS = new Set<RecurringPeriod>([
  'weekly',
  'bi-weekly',
  'monthly',
  'quarterly',
  'yearly',
]);

function asPeriod(p: string): RecurringPeriod {
  if (KNOWN_PERIODS.has(p as RecurringPeriod)) return p as RecurringPeriod;
  // Defensive: schema check forbids other values, but we don't crash if
  // a future migration adds one before this helper is updated.
  return 'monthly';
}

/**
 * Returns active recurring rows for a user, with computed `isPaused`
 * marker. Sorted by next_expected_date ASC so "what's coming up first"
 * is on top; nulls (no prediction yet) sink to the bottom.
 */
export async function listActiveRecurring(
  supabase: RecurringSupabaseClient,
  userId: string,
  options: { now?: Date } = {},
): Promise<ActiveRecurring[]> {
  const now = options.now ?? new Date();

  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(
      `id, description, period, average_amount_cents, currency,
       next_expected_date, last_seen_date, paused_until,
       detection_confidence, occurrences,
       merchant_id, category_id, account_id, created_at,
       merchants(display_name), categories(name), accounts(name)`,
    )
    .eq('user_id', userId)
    .eq('active', true)
    .order('next_expected_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logSafe('list_active_recurring', { userId, error: error.message });
    return [];
  }

  const rows = (data as unknown as RawRecurringRow[] | null) ?? [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return rows.map<ActiveRecurring>((r) => {
    const pausedUntilDate = r.paused_until ? new Date(`${r.paused_until}T00:00:00Z`) : null;
    const isPaused = pausedUntilDate !== null && pausedUntilDate.getTime() > today.getTime();
    return {
      id: r.id,
      description: r.description,
      period: asPeriod(r.period),
      averageAmountCents: BigInt(r.average_amount_cents),
      currency: r.currency,
      nextExpectedDate: r.next_expected_date,
      lastSeenDate: r.last_seen_date,
      pausedUntil: r.paused_until,
      isPaused,
      detectionConfidence: r.detection_confidence === null ? null : Number(r.detection_confidence),
      occurrences: r.occurrences,
      merchantId: r.merchant_id,
      categoryId: r.category_id,
      accountId: r.account_id,
      merchantName: r.merchants?.display_name ?? null,
      categoryName: r.categories?.name ?? null,
      accountName: r.accounts?.name ?? null,
      createdAt: r.created_at,
    };
  });
}

/**
 * Convert one recurring row's amount to its monthly equivalent cents,
 * rounded to nearest cent. Used by the /pretplate footer:
 * "Mjesečni ekvivalent svih pretplata: X KM".
 *
 * Math:
 *   weekly    → cents * 52 / 12
 *   bi-weekly → cents * 26 / 12
 *   monthly   → cents
 *   quarterly → cents / 3
 *   yearly    → cents / 12
 *
 * Operates on bigints throughout to avoid float drift on large amounts.
 * Sign is preserved (negative outflows stay negative).
 */
export function monthlyEquivalentCents(amountCents: bigint, period: RecurringPeriod): bigint {
  switch (period) {
    case 'weekly':
      // (cents * 52) / 12 — multiply first to keep precision.
      return (amountCents * 52n) / 12n;
    case 'bi-weekly':
      return (amountCents * 26n) / 12n;
    case 'monthly':
      return amountCents;
    case 'quarterly':
      return amountCents / 3n;
    case 'yearly':
      return amountCents / 12n;
    default: {
      const _exhaustive: never = period;
      void _exhaustive;
      return amountCents;
    }
  }
}

/**
 * Sum the monthly-equivalent for a list of recurring rows. Single-
 * currency only (caller groups by currency first when mixed). Skipping
 * paused rows is the caller's choice — pass `{ skipPaused: true }` to
 * exclude them from the total.
 */
export function totalMonthlyEquivalentCents(
  items: readonly Pick<ActiveRecurring, 'averageAmountCents' | 'period' | 'isPaused'>[],
  options: { skipPaused?: boolean } = {},
): bigint {
  let sum = 0n;
  for (const item of items) {
    if (options.skipPaused && item.isPaused) continue;
    sum += monthlyEquivalentCents(item.averageAmountCents, item.period);
  }
  return sum;
}
