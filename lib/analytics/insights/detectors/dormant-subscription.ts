/**
 * dormantSubscriptionDetector — active recurrings whose `last_seen_date`
 * is more than `period × 1.5` days in the past. Suggests the user may want
 * to pause it (perhaps the service was cancelled at the source).
 *
 * Period → days mapping:
 *   - weekly      = 7
 *   - bi-weekly   = 14
 *   - monthly     = 30
 *   - quarterly   = 90
 *   - yearly      = 365
 *
 * Skip conditions:
 *   - Recurring `isPaused` (already paused — no need to nag).
 *   - `< 3` occurrences (false-positive guard; baby recurrings often have
 *     gaps that look dormant but aren't).
 *   - No `lastSeenDate` (never observed; not really dormant — incomplete).
 *
 * Severity: info (suggestion, not urgent).
 *
 * Dedup key: `dormant_subscription:{recurringId}` — one live notice until
 * acted on. If the user dismisses, we don't re-fire until they un-dismiss
 * (i.e., next month after the cleanup sweep, if still dormant).
 */
import type { Detector, DetectorContext, Insight } from '../types';
import type { ActiveRecurring } from '@/lib/queries/recurring';

const PERIOD_DAYS: Record<string, number> = {
  weekly: 7,
  'bi-weekly': 14,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

const DORMANT_MULTIPLIER = 1.5;
const MIN_OCCURRENCES = 3;
const VALID_DAYS = 60;

function daysBetween(aIso: string, today: Date): number {
  const a = new Date(aIso);
  const ms = today.getTime() - a.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function expectedPeriodDays(r: Pick<ActiveRecurring, 'period'>): number | null {
  return PERIOD_DAYS[r.period] ?? null;
}

export const dormantSubscriptionDetector: Detector = {
  id: 'dormant_subscription',
  label: 'Dormant subscription',
  run(ctx: DetectorContext): Insight[] {
    const out: Insight[] = [];
    for (const r of ctx.recurring) {
      if (r.isPaused) continue;
      if (r.occurrences < MIN_OCCURRENCES) continue;
      if (r.lastSeenDate === null) continue;

      const periodDays = expectedPeriodDays(r);
      if (periodDays === null) continue;

      const overdueAfter = Math.floor(periodDays * DORMANT_MULTIPLIER);
      const sinceLast = daysBetween(r.lastSeenDate, ctx.today);
      if (sinceLast <= overdueAfter) continue;

      const validUntil = new Date(ctx.today);
      validUntil.setUTCDate(validUntil.getUTCDate() + VALID_DAYS);

      out.push({
        type: 'dormant_subscription',
        severity: 'info',
        title: `Pretplata neaktivna: ${r.description}`,
        body: `Pretplata **${r.description}** nije naplaćena već **${String(sinceLast)} dana** — to je dulje nego očekivano. Možda je dobro da je pauziraš dok ne provjeriš.`,
        actionUrl: `/pretplate/${r.id}`,
        dedupKey: `dormant_subscription:${r.id}`,
        validUntil,
        metadata: {
          recurringId: r.id,
          description: r.description,
          lastSeenDate: r.lastSeenDate,
          daysSinceLastSeen: sinceLast,
          period: r.period,
          expectedPeriodDays: periodDays,
        },
      });
    }
    return out;
  },
};
