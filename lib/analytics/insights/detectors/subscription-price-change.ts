/**
 * subscriptionPriceChangeDetector — recurring transactions whose latest
 * occurrence amount exceeds 110% of the recurring's `average_amount_cents`.
 *
 * The detector reads the most recent transaction per `recurringId` from the
 * pre-loaded transactions array (which already filters non-deleted etc.).
 *
 * Skip conditions:
 *   - Recurring with `< 3` recorded occurrences (need a stable baseline).
 *   - No transaction linked to this recurring in the lookback window
 *     (handled by `dormantSubscriptionDetector`, not us).
 *   - latest tx older than 60 days (dormant — out of our concern).
 *   - latest tx is the same date as the recurring's `last_seen_date` AND
 *     `average_amount_cents` was updated to match: i.e., the recurring has
 *     already been re-baselined. We detect this by comparing the latest tx
 *     amount to `average_amount_cents` directly; if the average has been
 *     updated to include the new price, the ratio drops below threshold.
 *
 * Severity: warning (always).
 *
 * Dedup key: `subscription_price_change:{recurringId}:{txId}` — fires once
 * per price-change event; if user keeps the new price, a future increase
 * generates a new insight.
 */
import type { Detector, DetectorContext, Insight, InsightsTxRow } from '../types';
import { formatCentsBs } from '../aggregations';

const PRICE_CHANGE_RATIO = 1.1;
const MIN_OCCURRENCES = 3;
const MAX_TX_AGE_DAYS = 60;
const VALID_DAYS = 30;

function daysBetween(aIso: string, bIso: Date): number {
  const a = new Date(aIso);
  const ms = bIso.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export const subscriptionPriceChangeDetector: Detector = {
  id: 'subscription_price_change',
  label: 'Subscription price change',
  run(ctx: DetectorContext): Insight[] {
    // Build map: recurringId → most recent transaction
    const latestByRecurring = new Map<string, InsightsTxRow>();
    for (const t of ctx.transactions) {
      if (t.recurringId === null) continue;
      const prev = latestByRecurring.get(t.recurringId);
      if (prev === undefined || t.transactionDate > prev.transactionDate) {
        latestByRecurring.set(t.recurringId, t);
      }
    }

    const out: Insight[] = [];

    for (const r of ctx.recurring) {
      if (r.occurrences < MIN_OCCURRENCES) continue;
      const latest = latestByRecurring.get(r.id);
      if (latest === undefined) continue;
      const ageDays = daysBetween(latest.transactionDate, ctx.today);
      if (ageDays > MAX_TX_AGE_DAYS) continue;
      if (ageDays < 0) continue;

      const latestAbs =
        latest.baseAmountCents < 0n ? -latest.baseAmountCents : latest.baseAmountCents;
      const avgAbs =
        r.averageAmountCents < 0n ? -r.averageAmountCents : r.averageAmountCents;
      if (avgAbs === 0n) continue;

      const ratio = Number(latestAbs) / Number(avgAbs);
      if (ratio < PRICE_CHANGE_RATIO) continue;

      const percentUp = Math.round((ratio - 1) * 100);
      const validUntil = new Date(ctx.today);
      validUntil.setUTCDate(validUntil.getUTCDate() + VALID_DAYS);

      out.push({
        type: 'subscription_price_change',
        severity: 'warning',
        title: `Pretplata poskupila: ${r.description}`,
        body: `**${r.description}** je poskupjela: ranije **${formatCentsBs(avgAbs, r.currency)}**, sada **${formatCentsBs(latestAbs, r.currency)}** (+${String(percentUp)}%).`,
        actionUrl: `/pretplate/${r.id}`,
        dedupKey: `subscription_price_change:${r.id}:${latest.id}`,
        validUntil,
        metadata: {
          recurringId: r.id,
          description: r.description,
          oldCents: avgAbs.toString(),
          newCents: latestAbs.toString(),
          percentChange: percentUp,
          transactionId: latest.id,
        },
      });
    }

    return out;
  },
};
