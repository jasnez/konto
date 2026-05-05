/**
 * Cashflow forecasting (F3-E3-T1).
 *
 * Project the user's available-cash balance N days into the future
 * given (a) current account balances, (b) confirmed
 * `recurring_transactions`, (c) active `installment_plans`, and
 * (d) baseline non-recurring spending derived from the last 90 days
 * of transaction history.
 *
 * Pure-TypeScript algorithm (mirror of recurring-detection): the SQL
 * layer is too rigid for a formula that's still being tuned, and 90
 * days × 50 events fits comfortably in TS time.
 *
 * Currency is normalised to a single base (`profile.base_currency`,
 * default BAM) at the START balance step. Recurring + installments
 * already live in their own currencies; we convert each to base on
 * the start date so the day-by-day series stays in one denomination.
 *
 * Design notes:
 *   - Account scope: cash-flow-bearing types only (checking, savings,
 *     cash, credit_card, revolut, wise, other). Investments excluded
 *     as volatile; loans excluded because the principal is long-term
 *     and we model the *payments* separately via installment_plans.
 *   - Recurring inflows not modelled in T1 (the detector is
 *     outflow-only). Inflow component comes from the baseline.
 *   - Baseline = (avg-daily-flow last 90d) MINUS (avg-daily contribution
 *     of recurring + installments). This stops us double-counting
 *     subscriptions in the baseline derived from the same history.
 *   - Insufficient history (< 30 active days): drop baseline to 0 and
 *     attach a warning. The forecast still includes recurring +
 *     installment events, just without the random-spend layer.
 *   - Paused recurring (paused_until > today) skipped while paused;
 *     resume automatically once the date passes.
 */
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { convertToBase } from '@/lib/fx/convert';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';

// ─── Public types ────────────────────────────────────────────────────────────

export type ForecastEventType = 'recurring' | 'installment' | 'baseline';

export interface ForecastEvent {
  type: ForecastEventType;
  description: string;
  /** Signed minor units in `baseCurrency`. Negative = outflow. */
  amountCents: bigint;
  /** Source row id when available (recurring_transactions.id, installment_plans.id). */
  sourceId?: string;
}

export interface ForecastDay {
  /** YYYY-MM-DD. */
  date: string;
  /** End-of-day projected balance after the day's flow. */
  balanceCents: bigint;
  inflowCents: bigint;
  outflowCents: bigint;
  /** All events that hit this day (recurring + installments + baseline marker). */
  events: ForecastEvent[];
}

export interface ForecastResult {
  baseCurrency: string;
  /** Sum of in-scope account balances at start, converted to base. */
  startBalanceCents: bigint;
  startDate: string;
  daysAhead: number;
  /** Day-by-day projection, length = daysAhead (today excluded as starting point). */
  projections: ForecastDay[];
  /** Lowest end-of-day balance and the day it occurs. Null when projection is empty. */
  lowestPoint: { date: string; balanceCents: bigint } | null;
  /** Days until balance first crosses 0. Null when balance never goes negative. */
  runwayDays: number | null;
  /** Avg daily inflow component of the baseline (positive bigint, in base). */
  baselineInflowCents: bigint;
  /** Avg daily outflow component of the baseline (positive bigint, in base). */
  baselineOutflowCents: bigint;
  /** UI-facing warnings (e.g. "Insufficient history"). */
  warnings: string[];
}

/** Subset of `accounts` columns the forecast reads. */
export interface AccountRow {
  id: string;
  type: string;
  currency: string;
  current_balance_cents: number;
  is_active: boolean;
  include_in_net_worth: boolean;
  deleted_at: string | null;
}

/** Subset of `recurring_transactions` columns. */
export interface RecurringRow {
  id: string;
  description: string;
  period: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';
  average_amount_cents: number;
  currency: string;
  next_expected_date: string | null;
  last_seen_date: string | null;
  paused_until: string | null;
  active: boolean;
}

/** Subset of `installment_plans` columns. */
export interface InstallmentRow {
  id: string;
  notes: string | null;
  account_id: string;
  currency: string;
  installment_count: number;
  installment_cents: number;
  start_date: string;
  day_of_month: number;
  status: string;
  /** How many installments have already posted; for forecasting we only
   *  emit the remaining ones. Computed from the linked
   *  `installment_occurrences` table (nullable when no occurrences yet). */
  posted_count?: number;
}

/** Aggregated baseline inputs from transaction history. */
export interface HistoryStats {
  /** First transaction_date in the analysed window. */
  firstDate: string | null;
  /** Last transaction_date in the analysed window. */
  lastDate: string | null;
  /** Sum of negative `base_amount_cents` (as positive bigint). */
  totalOutflowCents: bigint;
  /** Sum of positive `base_amount_cents`. */
  totalInflowCents: bigint;
  /** Active days with ≥ 1 non-transfer/non-excluded transaction (avoids
   *  inflating the average when the user has gaps). */
  activeDays: number;
}

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Account types whose balances roll into the start figure. */
export const FORECAST_ACCOUNT_TYPES = [
  'checking',
  'savings',
  'cash',
  'credit_card',
  'revolut',
  'wise',
  'other',
] as const;

/** Days back we look at history for the baseline. */
export const BASELINE_WINDOW_DAYS = 90;

/** Below this active-day count we drop baseline to 0 and warn. */
export const MIN_BASELINE_ACTIVE_DAYS = 30;

/** Hard cap on `daysAhead` so a UI bug can't ask for a 10-year projection. */
export const MAX_DAYS_AHEAD = 365;

// ─── Public entry point ──────────────────────────────────────────────────────

type ForecastClient = Pick<SupabaseClient<Database>, 'from'>;

export interface ForecastOptions {
  /** Override "today" in tests. */
  now?: Date;
  /** Profile.base_currency override. Defaults to 'BAM'. */
  baseCurrency?: string;
  /** Skip FX (treat every amount as already in baseCurrency). For tests. */
  skipFx?: boolean;
}

/**
 * Run the forecast pipeline. Caller passes in a user-scoped Supabase
 * client; RLS + the explicit `user_id` filters do the auth lifting.
 */
export async function forecastCashflow(
  supabase: ForecastClient,
  userId: string,
  daysAhead: number,
  options: ForecastOptions = {},
): Promise<ForecastResult> {
  const days = Math.max(1, Math.min(MAX_DAYS_AHEAD, Math.floor(daysAhead)));
  const baseCurrency = options.baseCurrency ?? 'BAM';
  const today = options.now ?? new Date();
  const todayIso = format(today, 'yyyy-MM-dd');
  const warnings: string[] = [];

  // 1. Parallel data fetch.
  const [accountsRes, recurringRes, installmentsRes, historyRes, openingBalanceCatRes] =
    await Promise.all([
      supabase
        .from('accounts')
        .select(
          'id, type, currency, current_balance_cents, is_active, include_in_net_worth, deleted_at',
        )
        .eq('user_id', userId)
        .is('deleted_at', null),
      supabase
        .from('recurring_transactions')
        .select(
          'id, description, period, average_amount_cents, currency, next_expected_date, last_seen_date, paused_until, active',
        )
        .eq('user_id', userId)
        .eq('active', true),
      supabase
        .from('installment_plans')
        .select(
          'id, notes, account_id, currency, installment_count, installment_cents, start_date, day_of_month, status',
        )
        .eq('user_id', userId)
        .eq('status', 'active'),
      supabase
        .from('transactions')
        .select('transaction_date, base_amount_cents, category_id')
        .eq('user_id', userId)
        .gte('transaction_date', format(addDays(today, -BASELINE_WINDOW_DAYS), 'yyyy-MM-dd'))
        .is('deleted_at', null)
        .eq('is_transfer', false)
        .eq('is_excluded', false),
      supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('slug', 'opening_balance')
        .is('deleted_at', null)
        .maybeSingle(),
    ]);

  if (accountsRes.error) {
    logSafe('forecast_accounts', { userId, error: accountsRes.error.message });
  }
  if (recurringRes.error) {
    logSafe('forecast_recurring', { userId, error: recurringRes.error.message });
  }
  if (installmentsRes.error) {
    logSafe('forecast_installments', { userId, error: installmentsRes.error.message });
  }
  if (historyRes.error) {
    logSafe('forecast_history', { userId, error: historyRes.error.message });
  }
  if (openingBalanceCatRes.error) {
    logSafe('forecast_opening_balance_cat', {
      userId,
      error: openingBalanceCatRes.error.message,
    });
  }

  const accounts = (accountsRes.data ?? []) as AccountRow[];
  const recurring = (recurringRes.data ?? []) as RecurringRow[];
  const installments = (installmentsRes.data ?? []) as InstallmentRow[];
  const openingBalanceCategoryId = openingBalanceCatRes.data?.id ?? null;
  // Opening-balance txs already shape the start balance via account
  // triggers; counting them again in the 90d baseline distorts daily
  // averages (esp. when a loan opening is a large negative). Mirrors
  // the same exclusion in get_monthly_summary (migration 00038).
  const history = (
    (historyRes.data ?? []) as {
      transaction_date: string;
      base_amount_cents: number;
      category_id: string | null;
    }[]
  ).filter((t) =>
    openingBalanceCategoryId === null ? true : t.category_id !== openingBalanceCategoryId,
  );

  // 2. Start balance — sum in-scope accounts in their original currency,
  //    convert each to base currency on today's date, then add.
  const startBalanceCents = await computeStartBalance(
    accounts,
    baseCurrency,
    todayIso,
    Boolean(options.skipFx),
  );

  // 3. Generate predicted events.
  const recurringEvents = await generateRecurringEvents(
    recurring,
    today,
    days,
    baseCurrency,
    todayIso,
    Boolean(options.skipFx),
  );
  const installmentEvents = await generateInstallmentEvents(
    installments,
    today,
    days,
    baseCurrency,
    todayIso,
    Boolean(options.skipFx),
  );

  // 4. Baseline daily flow (offsets recurring + installment so we don't
  //    double-count subscription cadence baked into the history).
  const historyStats = aggregateHistoryStats(history);
  if (historyStats.activeDays < MIN_BASELINE_ACTIVE_DAYS) {
    warnings.push(
      `Treba ti barem ${String(MIN_BASELINE_ACTIVE_DAYS)} dana istorije za pouzdanu projekciju (trenutno ${String(historyStats.activeDays)}).`,
    );
  }
  const baseline = computeBaseline(
    historyStats,
    monthlyEquivalent(recurringEvents) + monthlyEquivalent(installmentEvents),
  );

  // 5. Project day-by-day.
  const projections = projectDayByDay(
    startBalanceCents,
    today,
    days,
    [...recurringEvents, ...installmentEvents],
    baseline,
  );

  return {
    baseCurrency,
    startBalanceCents,
    startDate: todayIso,
    daysAhead: days,
    projections,
    lowestPoint: findLowestPoint(projections),
    runwayDays: findRunway(projections),
    baselineInflowCents: baseline.inflowCents,
    baselineOutflowCents: baseline.outflowCents,
    warnings,
  };
}

// ─── Start balance ──────────────────────────────────────────────────────────

async function computeStartBalance(
  accounts: AccountRow[],
  baseCurrency: string,
  todayIso: string,
  skipFx: boolean,
): Promise<bigint> {
  const inScope = accounts.filter(
    (a) =>
      a.is_active &&
      !a.deleted_at &&
      (FORECAST_ACCOUNT_TYPES as readonly string[]).includes(a.type),
  );
  let total = 0n;
  for (const acc of inScope) {
    const balance = BigInt(acc.current_balance_cents);
    if (skipFx || acc.currency === baseCurrency) {
      total += balance;
      continue;
    }
    try {
      const { baseCents } = await convertToBase(balance, acc.currency, baseCurrency, todayIso);
      total += baseCents;
    } catch (err) {
      logSafe('forecast_fx_account', {
        accountId: acc.id,
        from: acc.currency,
        to: baseCurrency,
        error: err instanceof Error ? err.message : String(err),
      });
      // Conservatively pretend the account didn't exist if FX fails — better
      // than including it as if it were already in base.
    }
  }
  return total;
}

// ─── Recurring events ───────────────────────────────────────────────────────

/**
 * Walk each active, non-paused recurring forward through the forecast
 * window emitting one event per scheduled occurrence.
 *
 * Anchor logic: prefer `next_expected_date`; fall back to
 * `last_seen_date + period` so we don't lose subscriptions that
 * predate the next-expected being populated.
 *
 * Paused subscriptions skip dates while `paused_until > today`. After
 * the date passes the cadence resumes (auto-resume per Epic 3.2).
 */
export async function generateRecurringEvents(
  recurring: readonly RecurringRow[],
  today: Date,
  daysAhead: number,
  baseCurrency: string,
  todayIso: string,
  skipFx: boolean,
): Promise<ForecastEvent[]> {
  const out: ForecastEvent[] = [];
  const horizon = addDays(today, daysAhead);

  for (const r of recurring) {
    if (!r.active) continue;
    if (BigInt(r.average_amount_cents) === 0n) continue;

    const pausedUntil = r.paused_until ? parseISO(r.paused_until) : null;
    let cursor = anchorDate(r, today);
    if (cursor === null) continue;

    // Walk forward until cursor lands inside [today+1, horizon].
    // Anchor may be in the past — fast-forward without emitting.
    while (cursor.getTime() <= today.getTime()) {
      cursor = stepPeriod(cursor, r.period);
    }

    // Convert the amount once per row.
    let amountInBase: bigint;
    if (skipFx || r.currency === baseCurrency) {
      amountInBase = BigInt(r.average_amount_cents);
    } else {
      try {
        const { baseCents } = await convertToBase(
          BigInt(r.average_amount_cents),
          r.currency,
          baseCurrency,
          todayIso,
        );
        amountInBase = baseCents;
      } catch (err) {
        logSafe('forecast_fx_recurring', {
          recurringId: r.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    while (cursor.getTime() <= horizon.getTime()) {
      const cursorIso = format(cursor, 'yyyy-MM-dd');
      // Skip while paused.
      if (!(pausedUntil && cursor.getTime() <= pausedUntil.getTime())) {
        out.push({
          type: 'recurring',
          description: r.description,
          amountCents: amountInBase,
          sourceId: r.id,
          // Date is encoded into the projection key during projectDayByDay
          // by the order events are pushed; we tag the iso here too via a
          // closure on the bucket below.
          // (see ForecastEvent — date isn't on it; the per-day map carries it.)
        });
        // Tagging via bucket:
        eventDateMap.set(out.length - 1, cursorIso);
      }
      cursor = stepPeriod(cursor, r.period);
    }
  }
  return out;
}

/**
 * The recurring/installment generators emit events in a flat array but
 * the projector needs to know which day each one hits. We carry that
 * mapping out-of-band so `ForecastEvent` (the public shape) stays free
 * of internal scheduling fields.
 *
 * NB: this is module-local mutable state — callers must not interleave
 * `generateRecurringEvents` and `generateInstallmentEvents` calls
 * across different forecasts. The pipeline always runs both for one
 * user before reading the map, so that constraint is implicit.
 */
const eventDateMap = new Map<number, string>();

function anchorDate(r: RecurringRow, today: Date): Date | null {
  if (r.next_expected_date) {
    return parseISO(r.next_expected_date);
  }
  if (r.last_seen_date) {
    return stepPeriod(parseISO(r.last_seen_date), r.period);
  }
  // No anchor at all — assume "today" so the first emit lands at today
  // + period (we step forward in the loop before emitting).
  return new Date(today);
}

function stepPeriod(d: Date, period: RecurringRow['period']): Date {
  switch (period) {
    case 'weekly':
      return addWeeks(d, 1);
    case 'bi-weekly':
      return addWeeks(d, 2);
    case 'monthly':
      return addMonths(d, 1);
    case 'quarterly':
      return addMonths(d, 3);
    case 'yearly':
      return addMonths(d, 12);
    default: {
      const _exhaustive: never = period;
      void _exhaustive;
      return addMonths(d, 1);
    }
  }
}

// ─── Installment events ─────────────────────────────────────────────────────

/**
 * For each active installment plan, emit one event per remaining
 * occurrence inside the forecast window. Day-of-month is honoured up
 * to 28 (the schema cap). Uses `posted_count` (when available) to skip
 * already-paid installments; falls back to "everything from start_date
 * forward" when posted_count is missing.
 */
export async function generateInstallmentEvents(
  installments: readonly InstallmentRow[],
  today: Date,
  daysAhead: number,
  baseCurrency: string,
  todayIso: string,
  skipFx: boolean,
): Promise<ForecastEvent[]> {
  const out: ForecastEvent[] = [];
  const horizon = addDays(today, daysAhead);

  for (const ip of installments) {
    if (ip.status !== 'active') continue;
    if (ip.installment_count <= 0) continue;

    let amountInBase: bigint;
    if (skipFx || ip.currency === baseCurrency) {
      amountInBase = BigInt(ip.installment_cents);
    } else {
      try {
        const { baseCents } = await convertToBase(
          BigInt(ip.installment_cents),
          ip.currency,
          baseCurrency,
          todayIso,
        );
        amountInBase = baseCents;
      } catch (err) {
        logSafe('forecast_fx_installment', {
          installmentId: ip.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }
    // Installments are always outflows in this app.
    const signed = amountInBase > 0n ? -amountInBase : amountInBase;

    const startDate = parseISO(ip.start_date);
    const skipFirst = ip.posted_count ?? 0;
    for (let i = 0; i < ip.installment_count; i += 1) {
      if (i < skipFirst) continue;
      const due = installmentDateAt(startDate, i, ip.day_of_month);
      if (due.getTime() <= today.getTime()) continue;
      if (due.getTime() > horizon.getTime()) break;
      out.push({
        type: 'installment',
        description: ip.notes ?? 'Rata',
        amountCents: signed,
        sourceId: ip.id,
      });
      eventDateMap.set(out.length - 1, format(due, 'yyyy-MM-dd'));
    }
  }
  return out;
}

function installmentDateAt(start: Date, monthOffset: number, dayOfMonth: number): Date {
  const moved = addMonths(start, monthOffset);
  // Clamp to the configured day_of_month (≤ 28 by schema, so no end-of-
  // February surprises).
  return new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth(), dayOfMonth));
}

// ─── Baseline ───────────────────────────────────────────────────────────────

/**
 * Distil the last 90 days of (non-recurring, non-transfer, non-excluded)
 * transactions into avg-daily inflow / outflow figures. The caller
 * subtracts the recurring + installment monthly contribution so the
 * baseline represents *random* spend only and we don't double-count.
 */
export function aggregateHistoryStats(
  rows: readonly { transaction_date: string; base_amount_cents: number }[],
): HistoryStats {
  if (rows.length === 0) {
    return {
      firstDate: null,
      lastDate: null,
      totalOutflowCents: 0n,
      totalInflowCents: 0n,
      activeDays: 0,
    };
  }
  let totalOut = 0n;
  let totalIn = 0n;
  const dates = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;
  for (const r of rows) {
    const cents = BigInt(r.base_amount_cents);
    if (cents < 0n) totalOut += -cents;
    else totalIn += cents;
    dates.add(r.transaction_date);
    if (first === null || r.transaction_date < first) first = r.transaction_date;
    if (last === null || r.transaction_date > last) last = r.transaction_date;
  }
  return {
    firstDate: first,
    lastDate: last,
    totalOutflowCents: totalOut,
    totalInflowCents: totalIn,
    activeDays: dates.size,
  };
}

export interface BaselineDailyFlow {
  /** Avg daily outflow from random / non-recurring spending. Always positive. */
  outflowCents: bigint;
  /** Avg daily inflow (irregular tx). Always positive. */
  inflowCents: bigint;
}

/**
 * The history-derived avg daily flow MINUS the daily contribution of
 * recurring + installments we're already projecting separately.
 *
 * `monthlyRecurringOutflowCents` is positive (a magnitude). We
 * subtract `monthly / 30` from the outflow side. If the subtraction
 * goes negative the user is effectively a "subscription-only"
 * spender; clamp to 0 so we don't *invent* spend.
 *
 * When activeDays < MIN_BASELINE_ACTIVE_DAYS the caller has already
 * decided to attach a warning; we still compute the number from
 * whatever data exists, scaled by activeDays as the divisor (avoids
 * a 5-day / 90-day ratio collapsing the baseline to near-zero).
 */
export function computeBaseline(
  history: HistoryStats,
  monthlyRecurringOutflowCents: bigint,
): BaselineDailyFlow {
  if (history.activeDays === 0) {
    return { outflowCents: 0n, inflowCents: 0n };
  }
  const days = BigInt(history.activeDays);
  const dailyOutFromHistory = history.totalOutflowCents / days;
  const dailyOutFromRecurring = monthlyRecurringOutflowCents / 30n;
  let outflow = dailyOutFromHistory - dailyOutFromRecurring;
  if (outflow < 0n) outflow = 0n;
  const inflow = history.totalInflowCents / days;
  return { outflowCents: outflow, inflowCents: inflow };
}

/** Sum of |amounts| in events, projected to a 30-day equivalent.
 *  Naive — assumes events are roughly uniform across the window. Good
 *  enough for offsetting the baseline (the projection itself uses the
 *  exact dates). */
function monthlyEquivalent(events: readonly ForecastEvent[]): bigint {
  if (events.length === 0) return 0n;
  let absSum = 0n;
  for (const e of events) {
    absSum += e.amountCents < 0n ? -e.amountCents : e.amountCents;
  }
  // Events live across the whole window; we don't know the window
  // length in here, so we use a 90-day proxy → /3 for monthly. Caller
  // controls the actual horizon, but baseline accuracy degrades
  // gracefully even when the window is shorter.
  return absSum / 3n;
}

// ─── Projection ─────────────────────────────────────────────────────────────

export function projectDayByDay(
  startBalanceCents: bigint,
  today: Date,
  daysAhead: number,
  events: readonly ForecastEvent[],
  baseline: BaselineDailyFlow,
): ForecastDay[] {
  // Bucket events by date.
  const buckets = new Map<string, ForecastEvent[]>();
  events.forEach((e, idx) => {
    const date = eventDateMap.get(idx);
    if (!date) return;
    const bucket = buckets.get(date);
    if (bucket) bucket.push(e);
    else buckets.set(date, [e]);
  });
  // Once consumed, clear the index so the next forecast starts clean.
  eventDateMap.clear();

  const days: ForecastDay[] = [];
  let balance = startBalanceCents;
  for (let i = 1; i <= daysAhead; i += 1) {
    const day = addDays(today, i);
    const dayIso = format(day, 'yyyy-MM-dd');
    const dayEvents = buckets.get(dayIso) ?? [];

    let inflow = baseline.inflowCents;
    let outflow = baseline.outflowCents;
    for (const e of dayEvents) {
      if (e.amountCents < 0n) outflow += -e.amountCents;
      else inflow += e.amountCents;
    }
    balance += inflow - outflow;

    const merged: ForecastEvent[] = [...dayEvents];
    if (baseline.outflowCents > 0n || baseline.inflowCents > 0n) {
      merged.push({
        type: 'baseline',
        description: 'Prosječna dnevna potrošnja',
        amountCents: -(baseline.outflowCents - baseline.inflowCents),
      });
    }

    days.push({
      date: dayIso,
      balanceCents: balance,
      inflowCents: inflow,
      outflowCents: outflow,
      events: merged,
    });
  }
  return days;
}

// ─── Lowest point + runway ──────────────────────────────────────────────────

export function findLowestPoint(
  projections: readonly ForecastDay[],
): { date: string; balanceCents: bigint } | null {
  if (projections.length === 0) return null;
  let lowest: { date: string; balanceCents: bigint } = {
    date: projections[0].date,
    balanceCents: projections[0].balanceCents,
  };
  for (const day of projections) {
    if (day.balanceCents < lowest.balanceCents) {
      lowest = { date: day.date, balanceCents: day.balanceCents };
    }
  }
  return lowest;
}

/**
 * Days until the projection first crosses below 0. Null when balance
 * never dips into the red across the whole window.
 *
 * Day index is 1-based because day 0 is "today" (start state) and the
 * projection skips the start day — projections[0] is day+1.
 */
export function findRunway(projections: readonly ForecastDay[]): number | null {
  for (let i = 0; i < projections.length; i += 1) {
    if (projections[i].balanceCents < 0n) {
      return i + 1;
    }
  }
  return null;
}

// ─── Test helpers (exported only for tests) ─────────────────────────────────

/**
 * Returns the count of date-dependent calendar days between two ISO
 * dates inclusive. Unused in production code but handy for tests
 * that need to verify "this event lands on day N".
 */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/**
 * Test-only: clear the internal event-date map so back-to-back
 * forecasts in a single test process don't bleed events between
 * runs. Production code never needs this — projectDayByDay clears
 * the map after consuming it.
 *
 * @internal
 */
export function _resetEventDateMap(): void {
  eventDateMap.clear();
}
