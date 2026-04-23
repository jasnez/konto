import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

interface MonthlySummaryRpcResult {
  total_balance: number | string | null;
  month_income: number | string | null;
  month_expense: number | string | null;
  month_net: number | string | null;
  prev_month_net: number | string | null;
  net_change_percent: number | string | null;
  avg_daily_spend: number | string | null;
}

export interface MonthlySummary {
  totalBalance: bigint;
  monthIncome: bigint;
  monthExpense: bigint;
  monthNet: bigint;
  prevMonthNet: bigint;
  netChangePercent: number;
  avgDailySpend: bigint;
}

export type SummarySupabaseClient = Pick<SupabaseClient<Database>, 'rpc'>;

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

const EMPTY_MONTHLY_SUMMARY: MonthlySummary = {
  totalBalance: 0n,
  monthIncome: 0n,
  monthExpense: 0n,
  monthNet: 0n,
  prevMonthNet: 0n,
  netChangePercent: 0,
  avgDailySpend: 0n,
};

export async function getMonthlySummary(
  supabase: SummarySupabaseClient,
  userId: string,
  baseCurrency: string,
  options: { year: number; month: number },
): Promise<MonthlySummary> {
  if (userId.trim().length === 0) {
    throw new Error('getMonthlySummary requires a valid userId');
  }

  const { data, error } = await supabase.rpc('get_monthly_summary', {
    p_year: options.year,
    p_month: options.month,
    p_base_currency: baseCurrency,
  });

  if (error) {
    // Ne ruši cijeli shell — npr. migracija RPC-a još nije na produkcijskom Supabaseu.
    console.error('[getMonthlySummary] get_monthly_summary:', error.message);
    return { ...EMPTY_MONTHLY_SUMMARY };
  }

  const payload = data as unknown as Partial<MonthlySummaryRpcResult>;

  return {
    totalBalance: toBigInt(payload.total_balance),
    monthIncome: toBigInt(payload.month_income),
    monthExpense: toBigInt(payload.month_expense),
    monthNet: toBigInt(payload.month_net),
    prevMonthNet: toBigInt(payload.prev_month_net),
    netChangePercent: toNumber(payload.net_change_percent),
    avgDailySpend: toBigInt(payload.avg_daily_spend),
  };
}
