/**
 * budgetBreachPredictor — projects current period's spend onto end-of-period
 * via a simple linear extrapolation: `(spent / daysElapsed) × totalDays`.
 * Fires when the projection exceeds the budget amount.
 *
 * Skip conditions:
 *   - Inactive budgets (already filtered upstream by `listBudgetsWithSpent`,
 *     but defensive).
 *   - Monthly budgets: skip if `daysElapsed < 7` (insufficient signal — one
 *     bad weekend would falsely predict overrun).
 *   - Weekly budgets: skip if `daysElapsed < 3`.
 *   - `daysLeft <= 0` — period over; the breach is actual, not predicted,
 *     and nothing for the user to do about it now.
 *
 * Severity calibration (vs amount):
 *   - 100–120% projected → warning
 *   - >120% projected     → alert
 *
 * Dedup key: `budget_breach:{budgetId}:{periodStart}` — fresh each period.
 */
import type { Detector, DetectorContext, Insight } from '../types';
import { formatCentsBs } from '../aggregations';

const WARN_RATIO = 1.0;
const ALERT_RATIO = 1.2;

const PERIOD_TOTAL_DAYS = {
  monthly: 30, // Approximate; the projection uses actual days-in-month below.
  weekly: 7,
} as const;

const MIN_DAYS_ELAPSED = {
  monthly: 7,
  weekly: 3,
} as const;

/**
 * Computes start-of-period date and total days in the period given the
 * budget period and `today`. We anchor:
 *   - monthly  → first day of `today`'s calendar month (UTC)
 *   - weekly   → most recent Monday (UTC). bs-BA convention.
 *
 * Returns `{ periodStart, totalDays, daysElapsed }`. `daysElapsed` is
 * inclusive of today (a budget on day 1 has 1 day elapsed).
 */
function computePeriodWindow(
  period: 'monthly' | 'weekly',
  today: Date,
): { periodStart: Date; totalDays: number; daysElapsed: number } {
  if (period === 'monthly') {
    const periodStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    // Days in this calendar month
    const nextMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    );
    const totalDays = Math.round(
      (nextMonth.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    const daysElapsed =
      Math.floor((today.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return { periodStart, totalDays, daysElapsed };
  }
  // weekly — Monday-anchored (bs locale convention)
  // getUTCDay(): 0 = Sunday, 1 = Monday, …, 6 = Saturday.
  const dow = today.getUTCDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const periodStart = new Date(today);
  periodStart.setUTCDate(periodStart.getUTCDate() - daysSinceMonday);
  periodStart.setUTCHours(0, 0, 0, 0);
  const daysElapsed = daysSinceMonday + 1;
  return { periodStart, totalDays: PERIOD_TOTAL_DAYS.weekly, daysElapsed };
}

export const budgetBreachPredictor: Detector = {
  id: 'budget_breach',
  label: 'Budget breach predictor',
  run(ctx: DetectorContext): Insight[] {
    const out: Insight[] = [];
    for (const b of ctx.budgets) {
      if (!b.active) continue;
      // b.period is typed as 'monthly' | 'weekly' upstream; no runtime guard
      // needed.

      const { periodStart, totalDays, daysElapsed } = computePeriodWindow(b.period, ctx.today);

      const minRequired = MIN_DAYS_ELAPSED[b.period];
      if (daysElapsed < minRequired) continue;
      if (b.daysLeft <= 0) continue;

      // Linear projection: scale current spend to end-of-period.
      // Use bigint math via integer-equivalent (cents × totalDays / daysElapsed).
      // We KNOW daysElapsed > 0 here because of the check above.
      const projectedCents =
        (b.spentCents * BigInt(totalDays)) / BigInt(daysElapsed);

      if (b.amountCents === 0n) continue; // misconfigured budget; skip

      const ratio = Number(projectedCents) / Number(b.amountCents);
      if (ratio < WARN_RATIO) continue;

      const severity = ratio >= ALERT_RATIO ? 'alert' : 'warning';
      const overrunCents = projectedCents - b.amountCents;
      const projectedPercent = Math.round(ratio * 100);
      const periodStartIso = periodStart.toISOString().slice(0, 10);

      // valid_until = end of period (or 60d, whichever sooner)
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + totalDays);
      const sixtyOut = new Date(ctx.today);
      sixtyOut.setUTCDate(sixtyOut.getUTCDate() + 60);
      const validUntil = periodEnd < sixtyOut ? periodEnd : sixtyOut;

      out.push({
        type: 'budget_breach',
        severity,
        title: `Probit ćeš budžet: ${b.category.name}`,
        body: `Po trenutnom tempu, budžet **${b.category.name}** (${formatCentsBs(b.amountCents, b.currency)}) bit će probijen za **${formatCentsBs(overrunCents, b.currency)}** (${String(projectedPercent)}%).`,
        actionUrl: `/budzeti`,
        dedupKey: `budget_breach:${b.id}:${periodStartIso}`,
        validUntil,
        metadata: {
          budgetId: b.id,
          categoryId: b.category.id,
          categoryName: b.category.name,
          projectedCents: projectedCents.toString(),
          amountCents: b.amountCents.toString(),
          spentCents: b.spentCents.toString(),
          projectedPercent,
          daysElapsed,
          totalDays,
          periodStart: periodStartIso,
        },
      });
    }
    return out;
  },
};
