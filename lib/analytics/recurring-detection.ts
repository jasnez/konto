/**
 * Recurring transaction detection (F3-E2-T1).
 *
 * Pure-TypeScript algorithm. Given the user's last 6 months of
 * transactions, returns candidate subscriptions/recurring charges that
 * the UI (T3) can present for confirmation. The DB persistence layer
 * lives in T2 (`recurring_transactions` table); this module knows
 * nothing about that — it just analyses raw transaction rows and emits
 * `RecurringCandidate` objects.
 *
 * Design notes (full reasoning in PR description):
 *   - Outflows only (positive amounts skipped — payroll/refunds are
 *     T2 expansion).
 *   - Group by merchant_id when present, else by
 *     (normalized_description + currency). Account_id intentionally
 *     ignored so a subscription that follows the user across banks
 *     stays in one group.
 *   - Period via median of intervals + 60% sample-in-bucket rule.
 *     Supported periods: weekly / bi-weekly / monthly / quarterly /
 *     yearly. Bi-monthly (~60d) deliberately not supported in T1.
 *   - Confidence = weighted blend of occurrence count, interval
 *     stability (CV), amount stability (CV), period match strictness.
 *     Threshold 0.5 to be returned at all; UI tier-marks at 0.7.
 *   - Min 3 occurrences, min 30-day span, min 5 KM amount.
 *   - SQL-side aggregation deferred — TS in-memory is fast enough for
 *     5k tx and far easier to iterate on while the formula stabilises.
 */
import { addDays, addWeeks, addMonths, format, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDescription } from '@/lib/categorization/cascade';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';

// ─── Public types ────────────────────────────────────────────────────────────

export type RecurringPeriod = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringCandidate {
  /** Stable identifier — `merchant:<uuid>` or `desc:<hash>`. */
  groupKey: string;
  merchantId: string | null;
  /** Display label (merchant.display_name OR most-common merchant_raw OR description). */
  description: string;
  period: RecurringPeriod;
  /** Median amount in minor units. Always negative for outflows in T1. */
  averageAmountCents: bigint;
  currency: string;
  /** Last seen transaction date as ISO YYYY-MM-DD. */
  lastSeen: string;
  /** Predicted next occurrence as ISO YYYY-MM-DD (lastSeen + period). */
  nextExpected: string;
  /** 0..1 confidence; only candidates with confidence ≥ 0.5 are returned. */
  confidence: number;
  occurrences: number;
  /** Constituent transaction ids (for the UI history view). */
  transactionIds: string[];
  /** Dominant category among the group, if a single category covers > 50%. */
  suggestedCategoryId: string | null;
}

/** Subset of `transactions` columns the algorithm reads. Public so callers
 *  (and tests) can pass synthetic rows without faking the full PostgREST
 *  payload. */
export interface RecurringTxRow {
  id: string;
  transaction_date: string; // YYYY-MM-DD
  base_amount_cents: number;
  base_currency: string;
  original_amount_cents: number;
  original_currency: string;
  merchant_id: string | null;
  merchant_raw: string | null;
  description: string | null;
  category_id: string | null;
  is_transfer: boolean;
  is_excluded: boolean;
  is_pending: boolean;
  source: string;
  created_at?: string;
  // merchant relation, when joined
  merchants?: { display_name: string | null } | null;
}

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Window of history we analyse. Six months gives 6+ data points for
 *  monthly subscriptions and 24+ for weekly without bloating the fetch. */
export const HISTORY_WINDOW_DAYS = 180;

/** Below this absolute amount we ignore — coffee-money, not subscriptions. */
export const MIN_ABS_AMOUNT_CENTS = 500n; // 5 KM / 5 EUR / etc.

/** Minimum group size before we consider running the analysis. */
export const MIN_OCCURRENCES = 3;

/** Minimum span between first and last transaction in a group. Without
 *  this, three same-day transactions would falsely look like a tight
 *  recurring pattern. */
export const MIN_SPAN_DAYS = 30;

/** Below this score, we drop the candidate entirely. */
export const MIN_RETURN_CONFIDENCE = 0.5;

/** Period classification windows (median days). Inclusive bounds. */
const PERIOD_BUCKETS: { period: RecurringPeriod; min: number; max: number; label: number }[] = [
  { period: 'weekly', min: 5, max: 9, label: 7 },
  { period: 'bi-weekly', min: 12, max: 16, label: 14 },
  { period: 'monthly', min: 26, max: 34, label: 30 },
  { period: 'quarterly', min: 85, max: 95, label: 90 },
  { period: 'yearly', min: 350, max: 380, label: 365 },
];

/** When ≥ this fraction of pairwise intervals fall inside the period
 *  bucket, the period match is "strict" (1.0); otherwise "loose" (0.5). */
const STRICT_MATCH_FRACTION = 0.6;

// ─── Public entry point ──────────────────────────────────────────────────────

type DetectClient = Pick<SupabaseClient<Database>, 'from'>;

/**
 * Fetch the last 6 months of the user's transactions and run the
 * detection pipeline. Caller is responsible for auth — RLS scopes the
 * fetch to `auth.uid()` regardless, but we also pass `userId`
 * defensively to make the logged query target explicit.
 *
 * Returns candidates sorted by confidence DESC.
 *
 * Performance budget: 500ms wall-clock for 5k transactions. In practice
 * a typical user (≤ 1.2k tx in 6mo) finishes in < 50ms after the fetch.
 */
export async function detectRecurring(
  supabase: DetectClient,
  userId: string,
): Promise<RecurringCandidate[]> {
  const since = format(addDays(new Date(), -HISTORY_WINDOW_DAYS), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, transaction_date, base_amount_cents, base_currency, original_amount_cents, original_currency, merchant_id, merchant_raw, description, category_id, is_transfer, is_excluded, is_pending, source, created_at, merchants(display_name)',
    )
    .eq('user_id', userId)
    .gte('transaction_date', since)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: true });

  if (error) {
    logSafe('recurring_detection_fetch_error', { userId, error: error.message });
    return [];
  }

  const rows = (data as unknown as RecurringTxRow[]).filter(passesGlobalFilters);
  return runDetectionPipeline(rows);
}

/**
 * Pure pipeline that turns a pre-fetched (and pre-filtered) row set into
 * candidates. Exposed for tests so they don't need a Supabase mock when
 * the caller already has the rows.
 */
export function runDetectionPipeline(rows: RecurringTxRow[]): RecurringCandidate[] {
  const groups = groupTransactions(rows);
  const candidates: RecurringCandidate[] = [];

  for (const [groupKey, rawGroup] of groups) {
    const group = filterIntraGroupNoise(rawGroup);
    if (group.length < MIN_OCCURRENCES) continue;

    const dates = group.map((r) => parseISO(r.transaction_date));
    const amounts = group.map((r) => BigInt(r.base_amount_cents));

    const spanDays =
      (dates[dates.length - 1].getTime() - dates[0].getTime()) / (24 * 60 * 60 * 1000);
    if (spanDays < MIN_SPAN_DAYS) continue;

    const intervals = analyzeIntervals(dates);
    const period = classifyPeriod(intervals);
    if (period === null) continue;

    const amountAnalysis = analyzeAmounts(amounts);
    const confidence = computeConfidence({
      occurrences: group.length,
      intervalCV: intervals.cv,
      amountCV: amountAnalysis.cv,
      periodMatch: period.matchStrictness,
    });
    if (confidence < MIN_RETURN_CONFIDENCE) continue;

    candidates.push(
      buildCandidate({
        groupKey,
        group,
        intervals,
        amountAnalysis,
        period: period.period,
        confidence,
      }),
    );
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

// ─── Pre-grouping filters ────────────────────────────────────────────────────

/**
 * Row-level filters applied before grouping. Anything that should never
 * count as a recurring candidate at the DB level lives here.
 *
 * Outflow-only (T1): positive amounts skipped — payroll / refunds are a
 * T2 expansion. Pending transactions skipped because the amount may
 * still change before posting.
 */
export function passesGlobalFilters(r: RecurringTxRow): boolean {
  if (r.is_transfer) return false;
  if (r.is_excluded) return false;
  if (r.is_pending) return false;
  // T2-generated rows shouldn't feed back into detection.
  if (r.source === 'recurring') return false;
  // Outflows only.
  if (r.base_amount_cents >= 0) return false;
  // Coffee-money threshold.
  if (BigInt(r.base_amount_cents) > -MIN_ABS_AMOUNT_CENTS) return false;
  // Need a date and currency to do anything.
  if (!r.transaction_date || !r.base_currency) return false;
  return true;
}

// ─── Grouping ────────────────────────────────────────────────────────────────

/**
 * Bucket transactions by merchant id (if known) or normalised
 * description+currency. Account id is intentionally not part of the
 * key — a subscription that survives a bank switch should land in the
 * same group.
 *
 * Currency IS part of the key when grouping by description: a "NETFLIX"
 * charge in BAM and one in EUR are likely two different subscriptions.
 * When grouping by merchant_id we also stratify by currency for the
 * same reason.
 */
export function groupTransactions(rows: RecurringTxRow[]): Map<string, RecurringTxRow[]> {
  const out = new Map<string, RecurringTxRow[]>();
  for (const r of rows) {
    const key = makeGroupKey(r);
    const bucket = out.get(key);
    if (bucket) {
      bucket.push(r);
    } else {
      out.set(key, [r]);
    }
  }
  return out;
}

function makeGroupKey(r: RecurringTxRow): string {
  if (r.merchant_id) {
    return `merchant:${r.merchant_id}:${r.base_currency}`;
  }
  const text = r.merchant_raw ?? r.description ?? '';
  const norm = normalizeDescription(text);
  if (norm.length === 0) return `desc:_empty_:${r.base_currency}`;
  return `desc:${norm}:${r.base_currency}`;
}

/**
 * Within-group cleanup before analysis:
 *   - If > 50% of rows share a calendar date with another row in the
 *     group, the group is too noisy to be recurring (it looks like
 *     repeated impulse buys at the same merchant). Return [] to
 *     drop the group entirely.
 *   - Otherwise dedupe same-day duplicates: keep the earliest by
 *     created_at (or first occurrence in input order if no created_at).
 */
export function filterIntraGroupNoise(group: RecurringTxRow[]): RecurringTxRow[] {
  if (group.length === 0) return [];

  // Bucket by date to count duplicates.
  const dateCount = new Map<string, number>();
  for (const r of group) {
    dateCount.set(r.transaction_date, (dateCount.get(r.transaction_date) ?? 0) + 1);
  }

  const duplicateRows = group.filter((r) => (dateCount.get(r.transaction_date) ?? 0) > 1).length;
  if (duplicateRows > group.length / 2) {
    // Too noisy — likely impulse buys, not subscription cadence.
    return [];
  }

  // Dedupe: keep one row per date.
  const seenDates = new Set<string>();
  const sorted = [...group].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1;
    }
    const aCreated = a.created_at ?? '';
    const bCreated = b.created_at ?? '';
    return aCreated < bCreated ? -1 : aCreated > bCreated ? 1 : 0;
  });
  const out: RecurringTxRow[] = [];
  for (const r of sorted) {
    if (seenDates.has(r.transaction_date)) continue;
    seenDates.add(r.transaction_date);
    out.push(r);
  }
  return out;
}

// ─── Interval analysis ──────────────────────────────────────────────────────

export interface IntervalAnalysis {
  /** Pairwise day deltas between consecutive (sorted) dates. */
  intervals: number[];
  median: number;
  mean: number;
  /** Coefficient of variation = stdDev / mean. 0 when intervals are all
   *  identical; rises with irregularity. */
  cv: number;
}

export function analyzeIntervals(dates: Date[]): IntervalAnalysis {
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const days = Math.round(
      (sorted[i].getTime() - sorted[i - 1].getTime()) / (24 * 60 * 60 * 1000),
    );
    intervals.push(days);
  }
  if (intervals.length === 0) {
    return { intervals, median: 0, mean: 0, cv: 1 };
  }
  const median = computeMedian(intervals);
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean === 0 ? 1 : stdDev / mean;
  return { intervals, median, mean, cv };
}

// ─── Amount analysis ────────────────────────────────────────────────────────

export interface AmountAnalysis {
  /** Median amount, signed minor units. Used as the "true" subscription
   *  cost in the candidate output. */
  median: bigint;
  meanAbs: number;
  cv: number;
}

export function analyzeAmounts(amounts: bigint[]): AmountAnalysis {
  if (amounts.length === 0) {
    return { median: 0n, meanAbs: 0, cv: 1 };
  }
  // Sort by absolute value for the median (negatives sort naturally otherwise).
  const sortedAbs = [...amounts].map((a) => (a < 0n ? -a : a)).sort((a, b) => Number(a - b));
  const midIdx = Math.floor(sortedAbs.length / 2);
  // Reconstruct the sign of the original median position.
  const medianAbs = sortedAbs[midIdx];
  const sign = amounts[0] < 0n ? -1n : 1n; // T1: outflow-only, so sign is uniform
  const median = sign * medianAbs;

  const meanAbs = sortedAbs.reduce((s, v) => s + Number(v), 0) / sortedAbs.length;
  const variance = sortedAbs.reduce((s, v) => s + (Number(v) - meanAbs) ** 2, 0) / sortedAbs.length;
  const stdDev = Math.sqrt(variance);
  const cv = meanAbs === 0 ? 1 : stdDev / meanAbs;

  return { median, meanAbs, cv };
}

// ─── Period classification ──────────────────────────────────────────────────

export interface PeriodClassification {
  period: RecurringPeriod;
  /** 1.0 if ≥ STRICT_MATCH_FRACTION of intervals fall inside the bucket;
   *  0.5 otherwise. Fed into `computeConfidence`. */
  matchStrictness: number;
}

/**
 * Decide whether the median interval lands cleanly in one of the
 * supported period buckets, and how strict the per-interval agreement
 * is. Returns null when the median is outside every bucket — the
 * candidate is then dropped before confidence is even computed.
 */
export function classifyPeriod(intervals: IntervalAnalysis): PeriodClassification | null {
  const { median, intervals: ints } = intervals;
  if (ints.length === 0) return null;

  const bucket = PERIOD_BUCKETS.find((b) => median >= b.min && median <= b.max);
  if (!bucket) return null;

  const matches = ints.filter((d) => d >= bucket.min && d <= bucket.max).length;
  const fraction = matches / ints.length;
  return {
    period: bucket.period,
    matchStrictness: fraction >= STRICT_MATCH_FRACTION ? 1.0 : 0.5,
  };
}

// ─── Confidence ─────────────────────────────────────────────────────────────

export interface ConfidenceInputs {
  occurrences: number;
  intervalCV: number;
  amountCV: number;
  /** 0.5 or 1.0 from `classifyPeriod`. */
  periodMatch: number;
}

/**
 * Weighted blend documented in the file header. Returns 0 when the group
 * is too small to be trusted — the pipeline drops it before this even
 * matters, but the explicit guard keeps the function meaningful in
 * isolation tests.
 */
export function computeConfidence(inputs: ConfidenceInputs): number {
  if (inputs.occurrences < MIN_OCCURRENCES) return 0;

  const occurrenceScore = Math.min(1, inputs.occurrences / 6);
  const intervalScore = Math.max(0, 1 - inputs.intervalCV * 4);
  const amountScore = Math.max(0, 1 - inputs.amountCV * 5);
  const periodMatchScore = inputs.periodMatch;

  const raw =
    occurrenceScore * 0.3 + intervalScore * 0.3 + amountScore * 0.25 + periodMatchScore * 0.15;

  // Clamp to [0, 1] for safety; weights already sum to 1 so this is
  // belt-and-braces against future tweaks.
  return Math.max(0, Math.min(1, raw));
}

// ─── Next-occurrence prediction ─────────────────────────────────────────────

export function predictNext(lastSeen: Date, period: RecurringPeriod): Date {
  switch (period) {
    case 'weekly':
      return addDays(lastSeen, 7);
    case 'bi-weekly':
      return addDays(lastSeen, 14);
    case 'monthly':
      return addMonths(lastSeen, 1);
    case 'quarterly':
      return addMonths(lastSeen, 3);
    case 'yearly':
      return addMonths(lastSeen, 12);
    default: {
      // Exhaustive guard — TypeScript ensures we cover every member.
      const _exhaustive: never = period;
      void _exhaustive;
      return addWeeks(lastSeen, 1);
    }
  }
}

// ─── Candidate construction ─────────────────────────────────────────────────

interface BuildArgs {
  groupKey: string;
  group: RecurringTxRow[];
  intervals: IntervalAnalysis;
  amountAnalysis: AmountAnalysis;
  period: RecurringPeriod;
  confidence: number;
}

export function buildCandidate(args: BuildArgs): RecurringCandidate {
  const { groupKey, group, amountAnalysis, period, confidence } = args;

  const sorted = [...group].sort((a, b) => (a.transaction_date < b.transaction_date ? -1 : 1));
  const last = sorted[sorted.length - 1];
  const lastSeenDate = parseISO(last.transaction_date);
  const nextDate = predictNext(lastSeenDate, period);

  return {
    groupKey,
    merchantId: last.merchant_id,
    description: pickDisplayDescription(group),
    period,
    averageAmountCents: amountAnalysis.median,
    currency: last.base_currency,
    lastSeen: format(lastSeenDate, 'yyyy-MM-dd'),
    nextExpected: format(nextDate, 'yyyy-MM-dd'),
    confidence: Math.round(confidence * 1000) / 1000, // 3 decimal places
    occurrences: group.length,
    transactionIds: sorted.map((r) => r.id),
    suggestedCategoryId: pickDominantCategory(group),
  };
}

function pickDisplayDescription(group: RecurringTxRow[]): string {
  // 1. merchant.display_name (joined relation) — best-quality label
  for (const r of group) {
    const dn = r.merchants?.display_name;
    if (dn && dn.trim().length > 0) return dn;
  }
  // 2. most-common merchant_raw
  const rawCounts = new Map<string, number>();
  for (const r of group) {
    if (r.merchant_raw && r.merchant_raw.trim().length > 0) {
      rawCounts.set(r.merchant_raw, (rawCounts.get(r.merchant_raw) ?? 0) + 1);
    }
  }
  if (rawCounts.size > 0) {
    return [...rawCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  // 3. fall back to description
  for (const r of group) {
    if (r.description && r.description.trim().length > 0) return r.description;
  }
  return 'Pretplata';
}

function pickDominantCategory(group: RecurringTxRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of group) {
    if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topCount] = ranked[0];
  return topCount / group.length > 0.5 ? topId : null;
}

// ─── Tiny helpers ───────────────────────────────────────────────────────────

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
