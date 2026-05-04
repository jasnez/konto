/**
 * unusualTransactionDetector — flags single transactions that fall outside
 * the typical distribution for their category over the trailing 90 days.
 *
 * Threshold: |tx.baseAmountCents| > μ_category + 2σ_category
 *
 * Skip conditions:
 *   - Category has < 8 transactions in the 90-day window (too few to compute
 *     a stable σ).
 *   - Transaction older than 14 days (only flag fresh; old anomalies are
 *     noise — the user already saw them on their statement).
 *   - Income / transfer / saving categories — only expenses count.
 *   - σ ≤ 0 (degenerate; all amounts equal — skip).
 *   - Recurring-linked transactions (those have their own detector for
 *     price changes, and they're "expected" by definition).
 *
 * Severity calibration:
 *   - 2σ ≤ z < 3σ → info
 *   - z ≥ 3σ      → warning
 *
 * Dedup key: `unusual_transaction:{transactionId}` — per-tx, never repeats.
 */
import type { Detector, DetectorContext, Insight, InsightsTxRow } from '../types';
import { formatCentsBs, meanAndStdDev } from '../aggregations';

const MIN_CATEGORY_TX_COUNT = 8;
const MAX_AGE_DAYS = 14;
const Z_INFO = 2;
const Z_WARN = 3;
const VALID_DAYS = 30;

/** Days between two YYYY-MM-DD strings (a − b). Negative if a < b. */
function daysBetween(aIso: string, bIso: Date): number {
  const a = new Date(aIso);
  const ms = bIso.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export const unusualTransactionDetector: Detector = {
  id: 'unusual_transaction',
  label: 'Unusual transaction (z-score outlier)',
  run(ctx: DetectorContext): Insight[] {
    // Group expenses by category for the 90-day baseline window.
    const ninetyDaysAgo = new Date(ctx.today);
    ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90);
    const ninetyIso = ninetyDaysAgo.toISOString().slice(0, 10);

    // Filter to expenses, non-recurring, in window.
    const eligibleByCategory = new Map<string, InsightsTxRow[]>();
    for (const t of ctx.transactions) {
      if (t.categoryId === null) continue;
      if (t.categoryKind !== 'expense') continue;
      if (t.recurringId !== null) continue;
      if (t.transactionDate < ninetyIso) continue;
      const list = eligibleByCategory.get(t.categoryId);
      if (list === undefined) {
        eligibleByCategory.set(t.categoryId, [t]);
      } else {
        list.push(t);
      }
    }

    const out: Insight[] = [];

    for (const [categoryId, txs] of eligibleByCategory) {
      if (txs.length < MIN_CATEGORY_TX_COUNT) continue;

      const stats = meanAndStdDev(txs.map((t) => t.baseAmountCents));
      if (stats === null) continue;
      if (stats.stdDev <= 0) continue;

      const { mean, stdDev } = stats;
      // Iterate fresh transactions only — flag the ones above threshold.
      for (const t of txs) {
        const ageDays = daysBetween(t.transactionDate, ctx.today);
        if (ageDays > MAX_AGE_DAYS) continue;
        if (ageDays < 0) continue; // future-dated; ignore
        const absAmount = Number(
          t.baseAmountCents < 0n ? -t.baseAmountCents : t.baseAmountCents,
        );
        if (absAmount <= mean + Z_INFO * stdDev) continue;

        const z = (absAmount - mean) / stdDev;
        const severity = z >= Z_WARN ? 'warning' : 'info';

        const validUntil = new Date(ctx.today);
        validUntil.setUTCDate(validUntil.getUTCDate() + VALID_DAYS);

        const categoryName = t.categoryName ?? 'Bez kategorije';
        const merchantName = t.merchantName ?? 'transakcija';

        out.push({
          type: 'unusual_transaction',
          severity,
          title: `Neobična transakcija: ${merchantName}`,
          body: `Transakcija u kategoriji **${categoryName}**: ${formatCentsBs(t.baseAmountCents < 0n ? -t.baseAmountCents : t.baseAmountCents, ctx.baseCurrency)} (prosjek je ${formatCentsBs(BigInt(Math.round(mean)), ctx.baseCurrency)}).`,
          actionUrl: `/transakcije/${t.id}`,
          dedupKey: `unusual_transaction:${t.id}`,
          validUntil,
          metadata: {
            transactionId: t.id,
            categoryId,
            categoryName,
            amountCents: t.baseAmountCents.toString(),
            meanCents: Math.round(mean),
            sigmaCents: Math.round(stdDev),
            zScore: Math.round(z * 100) / 100,
          },
        });
      }
    }

    return out;
  },
};
