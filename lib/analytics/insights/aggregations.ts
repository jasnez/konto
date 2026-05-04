/**
 * Shared aggregations for insight detectors.
 *
 * These helpers compute the same statistics multiple detectors need
 * (e.g., monthly category spend, σ over a category window). Keeping them
 * in one file means a single change to the math — no mismatch between
 * `categoryAnomalyDetector` and `savingsOpportunityDetector`.
 */
import type { InsightsTxRow } from './types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** First day of the month for `d` (UTC-equivalent at 00:00). */
export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First day of `d`'s month minus `n` months. */
export function addMonthsUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** "YYYY-MM" stamp for the month containing `d` (UTC). */
export function monthBucket(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${String(y)}-${String(m).padStart(2, '0')}`;
}

/** YYYY-MM bucket for the date string (assumes ISO YYYY-MM-DD). */
export function txMonthBucket(transactionDate: string): string {
  // Avoid Date construction; parse the string directly to dodge tz drift.
  return transactionDate.slice(0, 7);
}

/** True if `transactionDate` falls within `[start, endExclusive)` (date-only). */
export function dateInRange(
  transactionDate: string,
  startInclusive: Date,
  endExclusive: Date,
): boolean {
  const sIso = startInclusive.toISOString().slice(0, 10);
  const eIso = endExclusive.toISOString().slice(0, 10);
  return transactionDate >= sIso && transactionDate < eIso;
}

// ─── Category × month aggregation ─────────────────────────────────────────────

/**
 * Group transactions by (categoryId, YYYY-MM). Returns a Map keyed by
 * `${categoryId}:${YYYY-MM}` with the SUM of |baseAmountCents| (i.e.,
 * absolute spend; sign-flipped for expenses).
 *
 * Inputs are filtered to: non-null categoryId, non-zero amount.
 *
 * Recurring-linked transactions are INCLUDED — they're real spend that
 * should count toward the category total; the recurring detectors
 * have their own logic.
 */
export function groupSpendByCategoryMonth(
  transactions: readonly InsightsTxRow[],
): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const t of transactions) {
    if (t.categoryId === null) continue;
    if (t.baseAmountCents === 0n) continue;
    const abs = t.baseAmountCents < 0n ? -t.baseAmountCents : t.baseAmountCents;
    const key = `${t.categoryId}:${txMonthBucket(t.transactionDate)}`;
    out.set(key, (out.get(key) ?? 0n) + abs);
  }
  return out;
}

/**
 * For each category that appears in `groupedByMonth`, return:
 *   - lastMonthCents — spend in the most recent FULL month relative to `today`
 *   - prev3AvgCents — average spend across the 3 months before that
 *   - monthsCovered — how many of the 3 trailing months had any data
 *
 * Returns undefined for a category with insufficient history (<3 months
 * of trailing data). Detectors decide what to do with that.
 *
 * NOTE: "last full month" is the calendar month BEFORE `today`. If today is
 * 2026-05-04, last full month is 2026-04. This avoids pulling early-month
 * partial-data conclusions ("oh you spent 0 KM on groceries this month —
 * congrats!" on May 2nd).
 */
export interface CategoryMonthlyStats {
  categoryId: string;
  /** Spend in the last full calendar month before `today`. */
  lastMonthCents: bigint;
  /** Mean of the 3 calendar months before that. May exclude zero-spend months. */
  prev3AvgCents: bigint;
  /** How many of those 3 months had any spend (0..3). */
  monthsCovered: number;
}

export function computeCategoryMonthlyStats(
  spendByCatMonth: ReadonlyMap<string, bigint>,
  today: Date,
): Map<string, CategoryMonthlyStats> {
  // "Last full month" = the month before today's month.
  const lastFullMonth = addMonthsUTC(today, -1);
  const lastBucket = monthBucket(lastFullMonth);
  const prevBuckets = [
    monthBucket(addMonthsUTC(today, -2)),
    monthBucket(addMonthsUTC(today, -3)),
    monthBucket(addMonthsUTC(today, -4)),
  ];

  // Discover unique category IDs.
  const categoryIds = new Set<string>();
  for (const k of spendByCatMonth.keys()) {
    const colonIdx = k.indexOf(':');
    if (colonIdx > 0) categoryIds.add(k.slice(0, colonIdx));
  }

  const out = new Map<string, CategoryMonthlyStats>();
  for (const categoryId of categoryIds) {
    const lastMonthCents = spendByCatMonth.get(`${categoryId}:${lastBucket}`) ?? 0n;
    let monthsCovered = 0;
    let trailingSum = 0n;
    for (const b of prevBuckets) {
      const v = spendByCatMonth.get(`${categoryId}:${b}`);
      if (v !== undefined && v > 0n) {
        monthsCovered += 1;
        trailingSum += v;
      }
    }
    const prev3AvgCents =
      monthsCovered > 0 ? trailingSum / BigInt(monthsCovered) : 0n;
    out.set(categoryId, { categoryId, lastMonthCents, prev3AvgCents, monthsCovered });
  }
  return out;
}

// ─── σ helpers (for unusualTransactionDetector) ──────────────────────────────

/**
 * Mean and sample standard deviation of |baseAmountCents| for a set of rows.
 * Returns `null` when the population is too small (<2 samples) since σ is
 * undefined or unstable then.
 *
 * Uses Number arithmetic (with bigint→number cast) because the magnitudes
 * involved (cents) easily fit in IEEE 754. Detectors check tx counts before
 * calling, so the conversion never overflows.
 */
export function meanAndStdDev(amountsCents: readonly bigint[]): {
  mean: number;
  stdDev: number;
} | null {
  if (amountsCents.length < 2) return null;
  const xs = amountsCents.map((b) => Number(b < 0n ? -b : b));
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev };
}

// ─── Bosnian month name (read-only locale dust) ──────────────────────────────

const BS_MONTHS = [
  'januaru',
  'februaru',
  'martu',
  'aprilu',
  'maju',
  'junu',
  'julu',
  'avgustu',
  'septembru',
  'oktobru',
  'novembru',
  'decembru',
] as const;

/** Returns "aprilu", "maju", … (locative case used in copy like "u {monthLocative}"). */
export function monthLocativeBs(d: Date): string {
  return BS_MONTHS[d.getUTCMonth()];
}

// ─── Currency formatting (avoid lib/format/format-money import in node tests) ─

/**
 * Formats cents → human-readable string for insight bodies. Mirrors the
 * European convention (period thousands, comma decimal). Currency suffix
 * only when explicitly opted in.
 *
 * NOTE: We don't reuse `lib/format/format-money.ts` because that module is
 * UI-tier; using it from a server-only analytics file is fine but pulls
 * format options that don't matter here. The math is trivial — duplicate
 * intentionally.
 */
export function formatCentsBs(cents: bigint, currency: string, withCurrency = true): string {
  const isNeg = cents < 0n;
  const abs = isNeg ? -cents : cents;
  const intPart = abs / 100n;
  const fracPart = abs % 100n;
  const fracStr = fracPart < 10n ? `0${String(fracPart)}` : String(fracPart);
  const intStr = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const out = `${isNeg ? '−' : ''}${intStr},${fracStr}`;
  if (!withCurrency) return out;
  const suffix = currency === 'BAM' ? 'KM' : currency;
  return `${out} ${suffix}`;
}
