/**
 * MT-8: Period→date-range arithmetic shared by `/potrosnja` and (eventually)
 * any other surface that needs to derive a "this week / this month / rolling
 * 3 months / this year" window. Originally lived inline in
 * `app/(app)/potrosnja/page.tsx` (computeDateRange) where it was a hidden
 * coupling with SQL RPC `get_spending_by_category` (migration 00062): both
 * had to compute the same window or drill-down links would land on the
 * wrong rows.
 *
 * **Lock-step contract with the RPC** — keep these in sync:
 *   - weekly:    ISO Monday → next Monday (date_trunc('week', …))
 *   - monthly:   1st of month → 1st of next month
 *   - quarterly: rolling 3 months ending today (NOT calendar quarter — the
 *                RPC computes `today - 3 months` using interval arithmetic;
 *                see migration 00062 § "rolling window")
 *   - yearly:    Jan 1 of current year → Jan 1 of next year
 *
 * If the RPC ever changes its window definition, mirror the change here
 * AND update `__tests__/compute-period-range.test.ts` so drift is caught
 * loudly rather than silently.
 *
 * **Inclusive vs exclusive bounds** — the SQL is half-open `[start, end)`,
 * but `/transakcije`'s `?from=&to=` query params treat `to` as INCLUSIVE.
 * This function returns inclusive `to` (= exclusive_end - 1 day) so the
 * drill-down link can be passed through verbatim.
 *
 * **Timezone** — all computations done in UTC. Caller passes
 * `todayIso` derived from server TZ; this avoids host-TZ drift inside the
 * library.
 */

export type SpendingPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface PeriodRange {
  /** Inclusive start, ISO YYYY-MM-DD. */
  from: string;
  /** Inclusive end, ISO YYYY-MM-DD. */
  to: string;
  /** Bosnian human-readable range label, e.g. "1. maj 2026 — 31. maj 2026". */
  label: string;
}

/**
 * Compute the inclusive `[from, to]` window + Bosnian label for a given
 * spending period as of `todayIso` (UTC).
 *
 * @param period   Period bucket — must match SpendingPeriod union.
 * @param todayIso Today's date as ISO YYYY-MM-DD (UTC). Caller supplies
 *                 it so test fixtures can pin a deterministic "today".
 */
export function computeDateRange(period: SpendingPeriod, todayIso: string): PeriodRange {
  // Parse YYYY-MM-DD as a UTC date so we don't pull in the host TZ here.
  const [yStr, mStr, dStr] = todayIso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const today = new Date(Date.UTC(y, m - 1, d));

  const fmt = (date: Date): string => date.toISOString().slice(0, 10);
  const human = (date: Date): string =>
    new Intl.DateTimeFormat('bs-BA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);

  let start: Date;
  let endExclusive: Date;

  if (period === 'weekly') {
    // ISO week: Monday = 1; date_trunc('week', …) lands on Monday.
    const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
    start = new Date(Date.UTC(y, m - 1, d - (dow - 1)));
    endExclusive = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    start = new Date(Date.UTC(y, m - 1, 1));
    endExclusive = new Date(Date.UTC(y, m, 1));
  } else if (period === 'quarterly') {
    // Rolling 3 months ending today (inclusive). Mirror RPC: end = today + 1 day.
    endExclusive = new Date(Date.UTC(y, m - 1, d + 1));
    start = new Date(Date.UTC(y, m - 1 - 3, d + 1));
  } else {
    start = new Date(Date.UTC(y, 0, 1));
    endExclusive = new Date(Date.UTC(y + 1, 0, 1));
  }

  // Convert exclusive end to inclusive end (last day of the window) for
  // /transakcije's `to` filter and human-readable labels.
  const inclusiveEnd = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);

  return {
    from: fmt(start),
    to: fmt(inclusiveEnd),
    label: `${human(start)} — ${human(inclusiveEnd)}`,
  };
}
