/**
 * savingsOpportunityDetector — recognises positive trends: last full month
 * spend in a category was significantly LOWER than the 3-month average.
 * "Bravo, uštedio si X KM!"
 *
 * Skip conditions:
 *   - <3 months of trailing data (insufficient baseline).
 *   - Trailing avg < 100 BAM equivalent (don't celebrate trivial savings).
 *   - Non-expense kind.
 *
 * Severity: always info (positive feedback, not actionable).
 *
 * Dedup key: `savings_opportunity:{categoryId}:{YYYY-MM}` — fresh per month.
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

const MIN_AVG_CENTS = 10000n; // 100 BAM
const SAVINGS_RATIO = 0.8;
const VALID_DAYS = 14;

export const savingsOpportunityDetector: Detector = {
  id: 'savings_opportunity',
  label: 'Savings opportunity (lower-than-usual spend)',
  run(ctx: DetectorContext): Insight[] {
    const out: Insight[] = [];

    const lastFullMonth = addMonthsUTC(ctx.today, -1);
    const lastBucket = monthBucket(lastFullMonth);
    const monthHuman = monthLocativeBs(lastFullMonth);

    const spendByCatMonth = groupSpendByCategoryMonth(ctx.transactions);
    const stats = computeCategoryMonthlyStats(spendByCatMonth, ctx.today);

    const categoryMeta = new Map<string, { name: string; kind: string }>();
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
      if (meta.kind !== 'expense') continue;
      if (s.monthsCovered < 3) continue;
      if (s.prev3AvgCents < MIN_AVG_CENTS) continue;

      // Note: lastMonthCents may be 0 (no spend at all). That's fine — it's
      // the strongest "savings" signal possible. We don't filter zeros out.
      const ratio = Number(s.lastMonthCents) / Number(s.prev3AvgCents);
      if (ratio >= SAVINGS_RATIO) continue;

      const savedCents = s.prev3AvgCents - s.lastMonthCents;
      const percentSaved = Math.round((1 - ratio) * 100);

      const validUntil = new Date(ctx.today);
      validUntil.setUTCDate(validUntil.getUTCDate() + VALID_DAYS);

      out.push({
        type: 'savings_opportunity',
        severity: 'info',
        title: `Bravo, uštedio si u kategoriji ${meta.name}`,
        body: `U **${meta.name}** si u ${monthHuman} potrošio **${String(percentSaved)}% manje** od prosjeka — ušteda oko **${formatCentsBs(savedCents, ctx.baseCurrency)}**.`,
        actionUrl: `/transakcije?category=${categoryId}`,
        dedupKey: `savings_opportunity:${categoryId}:${lastBucket}`,
        validUntil,
        metadata: {
          categoryId,
          categoryName: meta.name,
          lastMonthCents: s.lastMonthCents.toString(),
          avgCents: s.prev3AvgCents.toString(),
          savedCents: savedCents.toString(),
          ratio: Math.round(ratio * 100) / 100,
        },
      });
    }

    return out;
  },
};
