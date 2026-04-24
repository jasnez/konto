import { describe, expect, it, vi } from 'vitest';
import type { SummarySupabaseClient } from './summary';
import { getMonthlySummary, resolveSummaryDateParts } from './summary';

interface AccountRow {
  current_balance_cents: number;
  currency: string;
  include_in_net_worth: boolean;
}

function makeAccountFromMock(accountRows: AccountRow[], err: { message: string } | null = null) {
  const p = Promise.resolve({ data: accountRows, error: err });
  return {
    select: () => ({
      eq: () => ({
        is: () => p,
      }),
    }),
  };
}

function createSupabaseRpcMock(
  payload: unknown,
  error: { message: string } | null = null,
  accountRows: AccountRow[] = [],
): { supabase: SummarySupabaseClient; rpcMock: ReturnType<typeof vi.fn> } {
  const rpcMock = vi.fn().mockResolvedValue({
    data: payload,
    error,
  });

  const fromMock = vi.fn().mockReturnValue(makeAccountFromMock(accountRows, null));

  return {
    supabase: { rpc: rpcMock, from: fromMock as SummarySupabaseClient['from'] },
    rpcMock,
  };
}

describe('getMonthlySummary', () => {
  it('maps rpc result to bigint summary values', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock(
      {
        total_balance: '362340',
        month_income: '220000',
        month_expense: '145500',
        month_net: '74500',
        prev_month_net: '50000',
        net_change_percent: 49,
        avg_daily_spend: '6063',
      },
      null,
      [],
    );

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

  it('forwards p_today_date when caller resolves it in user timezone', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock(
      {
        total_balance: '0',
        month_income: '0',
        month_expense: '0',
        month_net: '0',
        prev_month_net: '0',
        net_change_percent: 0,
        avg_daily_spend: '0',
      },
      null,
      [],
    );

    await getMonthlySummary(supabase, 'user-1', 'BAM', {
      year: 2026,
      month: 4,
      todayDate: '2026-04-24',
    });

    expect(rpcMock).toHaveBeenCalledWith('get_monthly_summary', {
      p_year: 2026,
      p_month: 4,
      p_base_currency: 'BAM',
      p_today_date: '2026-04-24',
    });
  });

  it('keeps exclude and transfer effects from rpc-calculated totals', async () => {
    const { supabase } = createSupabaseRpcMock(
      {
        total_balance: '500000',
        month_income: '120000',
        month_expense: '30000',
        month_net: '90000',
        prev_month_net: '85000',
        net_change_percent: '5.9',
        avg_daily_spend: '1000',
      },
      null,
      [],
    );

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
    const { supabase } = createSupabaseRpcMock(
      {
        total_balance: '362145',
        month_income: '0',
        month_expense: '0',
        month_net: '0',
        prev_month_net: '0',
        net_change_percent: 0,
        avg_daily_spend: '0',
      },
      null,
      [],
    );

    const summary = await getMonthlySummary(supabase, 'user-1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(362145n);
  });

  it('on rpc error uses sum of accounts for total, monthly fields zero', async () => {
    const { supabase } = createSupabaseRpcMock(null, { message: 'function not found' }, [
      { current_balance_cents: 22_059, currency: 'BAM', include_in_net_worth: true },
      { current_balance_cents: 26_303, currency: 'BAM', include_in_net_worth: true },
    ]);

    const summary = await getMonthlySummary(supabase, 'u1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(22059n + 26303n);
    expect(summary.monthIncome).toBe(0n);
    expect(summary.monthExpense).toBe(0n);
  });

  it('when rpc returns 0 but accounts have balance, total comes from accounts', async () => {
    const { supabase } = createSupabaseRpcMock(
      {
        total_balance: '0',
        month_income: '0',
        month_expense: '0',
        month_net: '0',
        prev_month_net: '0',
        net_change_percent: 0,
        avg_daily_spend: '0',
      },
      null,
      [{ current_balance_cents: 84_01, currency: 'BAM', include_in_net_worth: true }],
    );

    const summary = await getMonthlySummary(supabase, 'u1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(8401n);
  });

  it('resolveSummaryDateParts returns year/month/day in the given timezone at midnight crossover', () => {
    // 2026-04-01T00:30 in Europe/Sarajevo == 2026-03-31T22:30 UTC.
    // Naive UTC-based derivation would report March; timezone-aware must report April.
    const utcInstant = new Date('2026-03-31T22:30:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts).toEqual({ year: 2026, month: 4, todayDate: '2026-04-01' });
  });

  it('resolveSummaryDateParts falls back to default timezone on invalid input', () => {
    const utcInstant = new Date('2026-04-24T10:00:00Z');
    const parts = resolveSummaryDateParts('Not/A_Real_TZ', utcInstant);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(4);
    expect(parts.todayDate).toBe('2026-04-24');
  });

  it('throws when userId is empty', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock({});

    await expect(
      getMonthlySummary(supabase, '   ', 'BAM', { year: 2026, month: 4 }),
    ).rejects.toThrow(/valid userId/u);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
