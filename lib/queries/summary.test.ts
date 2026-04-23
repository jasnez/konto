import { describe, expect, it, vi } from 'vitest';
import type { SummarySupabaseClient } from './summary';
import { getMonthlySummary } from './summary';

function createSupabaseRpcMock(
  payload: unknown,
  error: { message: string } | null = null,
): { supabase: SummarySupabaseClient; rpcMock: ReturnType<typeof vi.fn> } {
  const rpcMock = vi.fn().mockResolvedValue({
    data: payload,
    error,
  });

  return {
    supabase: {
      rpc: rpcMock,
    },
    rpcMock,
  };
}

describe('getMonthlySummary', () => {
  it('maps rpc result to bigint summary values', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock({
      total_balance: '362340',
      month_income: '220000',
      month_expense: '145500',
      month_net: '74500',
      prev_month_net: '50000',
      net_change_percent: 49,
      avg_daily_spend: '6063',
    });

    const summary = await getMonthlySummary(supabase, 'user-1', 'BAM', { year: 2026, month: 4 });

    expect(summary).toEqual({
      totalBalance: 362340n,
      monthIncome: 220000n,
      monthExpense: 145500n,
      monthNet: 74500n,
      prevMonthNet: 50000n,
      netChangePercent: 49,
      avgDailySpend: 6063n,
    });

    expect(rpcMock).toHaveBeenCalledWith('get_monthly_summary', {
      p_year: 2026,
      p_month: 4,
      p_base_currency: 'BAM',
    });
  });

  it('keeps exclude and transfer effects from rpc-calculated totals', async () => {
    const { supabase } = createSupabaseRpcMock({
      total_balance: '500000',
      month_income: '120000',
      month_expense: '30000',
      month_net: '90000',
      prev_month_net: '85000',
      net_change_percent: '5.9',
      avg_daily_spend: '1000',
    });

    const summary = await getMonthlySummary(supabase, 'user-1', 'BAM', { year: 2026, month: 4 });

    expect(summary.monthIncome).toBe(120000n);
    expect(summary.monthExpense).toBe(30000n);
    expect(summary.monthNet).toBe(90000n);
    expect(summary.netChangePercent).toBeCloseTo(5.9, 5);
  });

  it('handles cross-currency total from rpc in base BAM', async () => {
    // Example seed interpretation:
    // - 200000 BAM account
    // - 80000 BAM account
    // - 42000 EUR account -> 82145 BAM (rate 1.95583)
    const { supabase } = createSupabaseRpcMock({
      total_balance: '362145',
      month_income: '0',
      month_expense: '0',
      month_net: '0',
      prev_month_net: '0',
      net_change_percent: 0,
      avg_daily_spend: '0',
    });

    const summary = await getMonthlySummary(supabase, 'user-1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(362145n);
  });

  it('throws when rpc returns error', async () => {
    const { supabase } = createSupabaseRpcMock(null, { message: 'rpc failed' });

    await expect(
      getMonthlySummary(supabase, 'user-1', 'BAM', { year: 2026, month: 4 }),
    ).rejects.toThrow(/get_monthly_summary failed/u);
  });

  it('throws when userId is empty', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock({});

    await expect(
      getMonthlySummary(supabase, '   ', 'BAM', { year: 2026, month: 4 }),
    ).rejects.toThrow(/valid userId/u);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
