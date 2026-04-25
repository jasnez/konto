import type { SupabaseClient } from '@supabase/supabase-js';
import { BAM_EUR_RATE } from '@/lib/fx/constants';
import { safeIanaTimeZone } from '@/lib/safe-timezone';
import type { Database } from '@/supabase/types';

interface MonthlySummaryRpcResult {
  total_balance: number | string | null;
  total_liabilities: number | string | null;
  month_income: number | string | null;
  month_expense: number | string | null;
  month_net: number | string | null;
  prev_month_net: number | string | null;
  net_change_percent: number | string | null;
  avg_daily_spend: number | string | null;
}

export interface MonthlySummary {
  totalBalance: bigint;
  /** U baznoj valuti: zbroj duga s kredita (loan, credit_card) gdje je saldo < 0, kao pozitivna cifra. */
  totalLiabilities: bigint;
  monthIncome: bigint;
  monthExpense: bigint;
  monthNet: bigint;
  prevMonthNet: bigint;
  netChangePercent: number;
  avgDailySpend: bigint;
}

/** RPC + moguć upit na `accounts` (fallback zbroj stanja) */
export type SummarySupabaseClient = Pick<SupabaseClient<Database>, 'rpc' | 'from'>;

function toBigInt(value: number | string | null | undefined): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0n;
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 0n;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isRpcJsonObject(d: unknown): d is Record<string, unknown> {
  return d !== null && typeof d === 'object' && !Array.isArray(d);
}

const EMPTY_MONTHLY_SUMMARY: MonthlySummary = {
  totalBalance: 0n,
  totalLiabilities: 0n,
  monthIncome: 0n,
  monthExpense: 0n,
  monthNet: 0n,
  prevMonthNet: 0n,
  netChangePercent: 0,
  avgDailySpend: 0n,
};

function parseRpcPayload(data: unknown): Partial<MonthlySummaryRpcResult> | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Partial<MonthlySummaryRpcResult>;
    } catch {
      return null;
    }
  }
  if (isRpcJsonObject(data)) {
    return data;
  }
  return null;
}

/**
 * Ista logika BAM↔EUR kao u `get_monthly_summary` (dovoljno za BiH domaću valutu);
 * za ostale parove drži stvarni iznos (ograničen fallback).
 */
function convertCentsToBase(cents: bigint, from: string, base: string): bigint {
  if (from === base) return cents;
  if (from === 'BAM' && base === 'EUR') {
    return BigInt(Math.round(Number(cents) / BAM_EUR_RATE));
  }
  if (from === 'EUR' && base === 'BAM') {
    return BigInt(Math.round(Number(cents) * BAM_EUR_RATE));
  }
  if (from !== 'BAM' && from !== 'EUR' && (base === 'BAM' || base === 'EUR')) {
    console.warn('[getMonthlySummary] fallback: nepoznat par valuta, koristim 1:1', {
      from,
      base,
    });
  }
  return cents;
}

/** Zbroj stanja s računa, pretvoreno u baznu valutu (kao u RPC, uklj. u net worth) */
async function sumNetWorthFromAccounts(
  supabase: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  baseCurrency: string,
): Promise<bigint> {
  const { data, error } = await supabase
    .from('accounts')
    .select('current_balance_cents, currency, include_in_net_worth')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    console.error('[getMonthlySummary] sumNetWorthFromAccounts:', error.message);
    return 0n;
  }

  const base = baseCurrency.trim().toUpperCase();
  let total = 0n;
  for (const row of data) {
    if (!row.include_in_net_worth) {
      continue;
    }
    const cur = row.currency.toUpperCase();
    const cents = BigInt(Math.trunc(row.current_balance_cents));
    total += convertCentsToBase(cents, cur, base);
  }
  return total;
}

/** Zbroj apsolutnog duga (loan, credit_card, negativan saldo), u baznoj valuti. */
async function sumLiabilitiesFromAccounts(
  supabase: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  baseCurrency: string,
): Promise<bigint> {
  const { data, error } = await supabase
    .from('accounts')
    .select('current_balance_cents, currency, type')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    console.error('[getMonthlySummary] sumLiabilitiesFromAccounts:', error.message);
    return 0n;
  }

  const base = baseCurrency.trim().toUpperCase();
  let total = 0n;
  for (const row of data) {
    if (row.type !== 'loan' && row.type !== 'credit_card') {
      continue;
    }
    const cents = BigInt(Math.trunc(row.current_balance_cents));
    if (cents >= 0n) {
      continue;
    }
    const cur = row.currency.toUpperCase();
    const converted = convertCentsToBase(cents, cur, base);
    if (converted < 0n) {
      total += -converted;
    }
  }
  return total;
}

function fromRpcRow(payload: Partial<MonthlySummaryRpcResult>): MonthlySummary {
  return {
    totalBalance: toBigInt(payload.total_balance),
    totalLiabilities: toBigInt(payload.total_liabilities),
    monthIncome: toBigInt(payload.month_income),
    monthExpense: toBigInt(payload.month_expense),
    monthNet: toBigInt(payload.month_net),
    prevMonthNet: toBigInt(payload.prev_month_net),
    netChangePercent: toNumber(payload.net_change_percent),
    avgDailySpend: toBigInt(payload.avg_daily_spend),
  };
}

export interface GetMonthlySummaryOptions {
  year: number;
  month: number;
  /**
   * User's local date (YYYY-MM-DD) in their profile timezone. Forwarded to
   * the RPC so avg-daily-spend and latest-FX cutoff are evaluated against
   * the user's "today", not the DB's UTC clock. Optional: when omitted the
   * RPC falls back to `current_date` (UTC) — safe but off-by-one near month
   * turns for UTC+N users.
   */
  todayDate?: string;
}

/**
 * Compute year/month/todayDate in a given IANA timezone. Use this at the
 * call site so we never pass the server's UTC clock to the RPC.
 */
export function resolveSummaryDateParts(
  timezone: string | null | undefined,
  now: Date = new Date(),
): { year: number; month: number; todayDate: string } {
  const tz = safeIanaTimeZone(timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = get('day');
  return { year, month, todayDate: `${String(year)}-${String(month).padStart(2, '0')}-${day}` };
}

export async function getMonthlySummary(
  supabase: SummarySupabaseClient,
  userId: string,
  baseCurrency: string,
  options: GetMonthlySummaryOptions,
): Promise<MonthlySummary> {
  if (userId.trim().length === 0) {
    throw new Error('getMonthlySummary requires a valid userId');
  }

  const { data, error } = await supabase.rpc('get_monthly_summary', {
    p_year: options.year,
    p_month: options.month,
    p_base_currency: baseCurrency,
    ...(options.todayDate != null ? { p_today_date: options.todayDate } : {}),
  });

  if (error) {
    console.error('[getMonthlySummary] get_monthly_summary:', error.message);
    const [total, liab] = await Promise.all([
      sumNetWorthFromAccounts(supabase, userId, baseCurrency),
      sumLiabilitiesFromAccounts(supabase, userId, baseCurrency),
    ]);
    return { ...EMPTY_MONTHLY_SUMMARY, totalBalance: total, totalLiabilities: liab };
  }

  const payload = parseRpcPayload(data);
  if (payload == null) {
    console.error('[getMonthlySummary] nevažeći odgovor od RPC (data null ili JSON).');
    const [total, liab] = await Promise.all([
      sumNetWorthFromAccounts(supabase, userId, baseCurrency),
      sumLiabilitiesFromAccounts(supabase, userId, baseCurrency),
    ]);
    return { ...EMPTY_MONTHLY_SUMMARY, totalBalance: total, totalLiabilities: liab };
  }

  let out = fromRpcRow(payload);
  if (out.totalBalance === 0n) {
    const fromAccounts = await sumNetWorthFromAccounts(supabase, userId, baseCurrency);
    if (fromAccounts !== 0n) {
      console.warn('[getMonthlySummary] RPC vraća ukupno 0, koristim zbroj s računa (fallback).', {
        fromAccounts: fromAccounts.toString(),
      });
      out = { ...out, totalBalance: fromAccounts };
    }
  }
  return out;
}
