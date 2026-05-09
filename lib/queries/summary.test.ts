import { describe, expect, it, vi } from 'vitest';
import type { SummarySupabaseClient } from './summary';
import { getMonthlySummary, resolveSummaryDateParts } from './summary';

/**
 * getMonthlySummary only maps get_monthly_summary JSON to bigint. Mjesečni prihod,
 * trošak, neto i prosječni dnevni trošak nisu u TS poslovnoj logici — definiše ih
 * isključivo SQL (npr. isključenje kategorije opening_balance). Ako RPC pukne,
 * ti se iznosi ostanu 0; nema lokalne rekonstrukcije. Integracija: __tests__/rpc/get-monthly-summary.test.ts
 */

interface AccountRow {
  current_balance_cents: number;
  currency: string;
  include_in_net_worth: boolean;
  type?: string;
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
        total_liabilities: '5000',
        out_of_scope_liabilities: '20000000',
        out_of_scope_liability_count: 1,
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
      totalLiabilities: 5000n,
      outOfScopeLiabilities: 20000000n,
      outOfScopeLiabilityCount: 1,
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
        total_liabilities: '0',
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
        total_liabilities: '0',
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
        total_liabilities: '0',
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
    expect(summary.totalLiabilities).toBe(0n);
  });

  it('on rpc error uses sum of accounts for total, monthly fields zero', async () => {
    const { supabase } = createSupabaseRpcMock(null, { message: 'function not found' }, [
      {
        current_balance_cents: 22_059,
        currency: 'BAM',
        include_in_net_worth: true,
        type: 'checking',
      },
      {
        current_balance_cents: 26_303,
        currency: 'BAM',
        include_in_net_worth: true,
        type: 'savings',
      },
    ]);

    const summary = await getMonthlySummary(supabase, 'u1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(22059n + 26303n);
    expect(summary.totalLiabilities).toBe(0n);
    expect(summary.monthIncome).toBe(0n);
    expect(summary.monthExpense).toBe(0n);
  });

  it('on rpc error splits liabilities by include_in_net_worth flag', async () => {
    // Mirror of migration 00051 contract: in-scope debt (flag=true) feeds
    // `totalLiabilities`, out-of-scope debt (flag=false) feeds the
    // informational `outOfScopeLiabilities`. The fallback path through
    // `sumLiabilitiesFromAccounts` and `sumOutOfScopeLiabilitiesFromAccounts`
    // must produce the same split as the RPC so the dashboard stays
    // consistent when the RPC errors out.
    const { supabase } = createSupabaseRpcMock(null, { message: 'function not found' }, [
      {
        current_balance_cents: 10_000,
        currency: 'BAM',
        include_in_net_worth: true,
        type: 'checking',
      },
      {
        // Long-term mortgage — opted out of net worth via flag
        current_balance_cents: -50_000,
        currency: 'BAM',
        include_in_net_worth: false,
        type: 'loan',
      },
      {
        // Credit card — flag explicitly true, counts as in-scope debt
        current_balance_cents: -2_000,
        currency: 'BAM',
        include_in_net_worth: true,
        type: 'credit_card',
      },
    ]);

    const summary = await getMonthlySummary(supabase, 'u1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(10_000n);
    expect(summary.totalLiabilities).toBe(2_000n);
    expect(summary.outOfScopeLiabilities).toBe(50_000n);
    expect(summary.outOfScopeLiabilityCount).toBe(1);
  });

  it('when rpc returns 0 but accounts have balance, total comes from accounts', async () => {
    const { supabase } = createSupabaseRpcMock(
      {
        total_balance: '0',
        total_liabilities: '0',
        month_income: '0',
        month_expense: '0',
        month_net: '0',
        prev_month_net: '0',
        net_change_percent: 0,
        avg_daily_spend: '0',
      },
      null,
      [{ current_balance_cents: 84_01, currency: 'BAM', include_in_net_worth: true, type: 'cash' }],
    );

    const summary = await getMonthlySummary(supabase, 'u1', 'BAM', { year: 2026, month: 4 });

    expect(summary.totalBalance).toBe(8401n);
  });

  it('resolveSummaryDateParts returns year/month/day in the given timezone at midnight crossover', () => {
    // 2026-04-01T00:30 in Europe/Sarajevo == 2026-03-31T22:30 UTC.
    // Naive UTC-based derivation would report March; timezone-aware must report April.
    const utcInstant = new Date('2026-03-31T22:30:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts).toEqual({
      year: 2026,
      month: 4,
      todayDate: '2026-04-01',
      monthStart: '2026-04-01',
      monthEnd: '2026-04-30',
    });
  });

  it('resolveSummaryDateParts falls back to default timezone on invalid input', () => {
    const utcInstant = new Date('2026-04-24T10:00:00Z');
    const parts = resolveSummaryDateParts('Not/A_Real_TZ', utcInstant);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(4);
    expect(parts.todayDate).toBe('2026-04-24');
    expect(parts.monthStart).toBe('2026-04-01');
    expect(parts.monthEnd).toBe('2026-04-30');
  });

  it('resolveSummaryDateParts produces the right monthEnd for 31-day months', () => {
    // Mid-May 2026 in any IANA TZ: monthEnd must be the 31st, not the 30th.
    const utcInstant = new Date('2026-05-15T12:00:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts.monthStart).toBe('2026-05-01');
    expect(parts.monthEnd).toBe('2026-05-31');
  });

  it('resolveSummaryDateParts handles February in a leap year', () => {
    // 2024 is a leap year — February has 29 days.
    const utcInstant = new Date('2024-02-15T12:00:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts.monthStart).toBe('2024-02-01');
    expect(parts.monthEnd).toBe('2024-02-29');
  });

  it('resolveSummaryDateParts handles February in a non-leap year', () => {
    const utcInstant = new Date('2026-02-15T12:00:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts.monthStart).toBe('2026-02-01');
    expect(parts.monthEnd).toBe('2026-02-28');
  });

  it('resolveSummaryDateParts handles December (year-end edge)', () => {
    // The Date.UTC trick wraps day=0 of "month 12" into Dec 31 of the
    // *current* year — never silently spilling into next year.
    const utcInstant = new Date('2026-12-15T12:00:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts).toEqual({
      year: 2026,
      month: 12,
      todayDate: '2026-12-15',
      monthStart: '2026-12-01',
      monthEnd: '2026-12-31',
    });
  });

  it('resolveSummaryDateParts crosses month boundary forward in TZ ahead of UTC (regression)', () => {
    // 2026-05-01T00:30 in Europe/Sarajevo == 2026-04-30T22:30 UTC.
    // The /transakcije page used to compute "current month" from server
    // UTC and would have shown April 1–30 here; user's freshly-saved
    // transaction dated 2026-05-01 (their local "today") would not
    // appear. With the timezone-aware default, monthStart/monthEnd land
    // in May correctly.
    const utcInstant = new Date('2026-04-30T22:30:00Z');
    const parts = resolveSummaryDateParts('Europe/Sarajevo', utcInstant);
    expect(parts.monthStart).toBe('2026-05-01');
    expect(parts.monthEnd).toBe('2026-05-31');
  });

  it('throws when userId is empty', async () => {
    const { supabase, rpcMock } = createSupabaseRpcMock({});

    await expect(
      getMonthlySummary(supabase, '   ', 'BAM', { year: 2026, month: 4 }),
    ).rejects.toThrow(/valid userId/u);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
