/**
 * categoryAnomalyDetector — flags expense categories where last-full-month
 * spend exceeds 130% of the trailing 3-month average.
 *
 * Skip conditions:
 *   - Category has < 3 months of trailing data (insufficient baseline).
 *   - Trailing average < 50 BAM equivalent (noise floor — a 3 KM ratio
 *     of 4 KM doesn't deserve a notification).
 *   - Non-expense kind (income/transfer/saving). Saving categories are
 *     a "good thing to spend more on", not an anomaly.
 *
 * Severity calibration:
 *   - 1.30 ≤ ratio < 1.80 → warning
 *   - ratio ≥ 1.80          → alert
 *
 * Dedup key: `category_anomaly:{categoryId}:{YYYY-MM of last full month}` —
 * a fresh insight every month, dismissed insights don't lock-out next month.
 */
import type { Detector, DetectorContext, Insight } from '../types';
import {
  addMonthsUTC,
  computeCategoryMonthlyStats,
  formatCentsBs,
  groupSpendByCategoryMonth,
  monthBucket,
  monthLocativeBs,
} from '../aggregations';

const NOISE_FLOOR_CENTS = 5000n; // 50 BAM
const WARN_RATIO = 1.3;
const ALERT_RATIO = 1.8;
const VALID_DAYS = 14;

export const categoryAnomalyDetector: Detector = {
  id: 'category_anomaly',
  label: 'Category month-over-month anomaly',
  run(ctx: DetectorContext): Insight[] {
    const out: Insight[] = [];

    const lastFullMonth = addMonthsUTC(ctx.today, -1);
    const lastBucket = monthBucket(lastFullMonth);
    const monthHuman = monthLocativeBs(lastFullMonth);

    const spendByCatMonth = groupSpendByCategoryMonth(ctx.transactions);
    const stats = computeCategoryMonthlyStats(spendByCatMonth, ctx.today);

    // Resolve category meta via a lookup over transactions (faster than a
    // separate query — we already have it in context).
    const categoryMeta = new Map<
      string,
      { name: string; kind: string }
    >();
    for (const t of ctx.transactions) {
      if (t.categoryId !== null && !categoryMeta.has(t.categoryId)) {
        categoryMeta.set(t.categoryId, {
          name: t.categoryName ?? 'Bez kategorije',
          kind: t.categoryKind,
        });
      }
    }

    for (const [categoryId, s] of stats) {
      const meta = categoryMeta.get(categoryId);
      if (meta === undefined) continue;
      // Only expense categories make sense for "spent too much".
      if (meta.kind !== 'expense') continue;
      // Need full 3 months of trailing data for a reliable baseline.
      if (s.monthsCovered < 3) continue;
      // Avoid noise on tiny categories.
      if (s.prev3AvgCents < NOISE_FLOOR_CENTS) continue;

      // Ratio (current month vs avg). Use Number — magnitudes safe.
      const ratio = Number(s.lastMonthCents) / Number(s.prev3AvgCents);
      if (ratio < WARN_RATIO) continue;

      const severity = ratio >= ALERT_RATIO ? 'alert' : 'warning';
      const percentOver = Math.round((ratio - 1) * 100);

      const validUntil = new Date(ctx.today);
      validUntil.setUTCDate(validUntil.getUTCDate() + VALID_DAYS);

      out.push({
        type: 'category_anomaly',
        severity,
        title: `${meta.name}: potrošnja viša ${String(percentOver)}%`,
        body: `**${meta.name}** je u ${monthHuman} bila **${String(percentOver)}% veća** od prosjeka posljednja 3 mjeseca (${formatCentsBs(s.lastMonthCents, ctx.baseCurrency)} vs ${formatCentsBs(s.prev3AvgCents, ctx.baseCurrency)}).`,
        actionUrl: `/transakcije?category=${categoryId}`,
        dedupKey: `category_anomaly:${categoryId}:${lastBucket}`,
        validUntil,
        metadata: {
          categoryId,
          categoryName: meta.name,
          lastMonthCents: s.lastMonthCents.toString(),
          avgCents: s.prev3AvgCents.toString(),
          ratio: Math.round(ratio * 100) / 100,
        },
      });
    }

    return out;
  },
};
