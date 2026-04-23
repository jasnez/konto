import { Suspense } from 'react';
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BalanceHero } from '@/components/dashboard/balance-hero';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  RecentTransactions,
  type RecentTransactionItem,
} from '@/components/dashboard/recent-transactions';
import { TrendPlaceholder } from '@/components/dashboard/trend-placeholder';
import {
  DashboardHeroSkeleton,
  DashboardMetricsSkeleton,
  DashboardRecentTransactionsSkeleton,
} from '@/components/dashboard/dashboard-skeletons';
import { convertToBase } from '@/lib/fx/convert';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

interface DashboardSummary {
  totalBalanceCents: bigint;
  monthIncomeCents: bigint;
  monthExpenseCents: bigint;
  monthSavedCents: bigint;
  avgDailyThirtyDaysCents: bigint;
  netChangePercent: number;
}

interface BaseAmountRow {
  base_amount_cents: number;
}

interface RecentTxRow {
  id: string;
  transaction_date: string;
  base_amount_cents: number;
  base_currency: string;
  merchant_raw: string | null;
  is_transfer: boolean;
  merchants: { display_name: string } | null;
  categories: { name: string } | null;
}

function sumRows(rows: BaseAmountRow[] | null, absolute = false): bigint {
  let total = 0n;
  for (const row of rows ?? []) {
    const value = BigInt(row.base_amount_cents);
    total += absolute && value < 0n ? -value : value;
  }
  return total;
}

function divideRounded(value: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return 0n;
  return (value + divisor / 2n) / divisor;
}

function getGreetingPart(timezone: string): string {
  const parts = new Intl.DateTimeFormat('bs-BA', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(new Date());
  const hourPart = parts.find((part) => part.type === 'hour');
  const hour = Number.parseInt(hourPart?.value ?? '12', 10);

  if (hour < 11) return 'Dobro jutro';
  if (hour < 18) return 'Dobar dan';
  return 'Dobro veče';
}

function getFirstName(displayName: string | null, email: string | undefined): string {
  const trimmedDisplay = displayName?.trim();
  const emailLocalPart = email?.split('@')[0];
  const source =
    trimmedDisplay && trimmedDisplay.length > 0 ? trimmedDisplay : (emailLocalPart ?? 'korisniče');
  const firstName = source.split(/\s+/u)[0];
  return firstName.length > 0 ? firstName : 'korisniče';
}

function calculatePercentChange(current: bigint, previous: bigint): number {
  if (previous === 0n) {
    if (current === 0n) return 0;
    return current > 0n ? 100 : -100;
  }

  const ratio = (Number(current - previous) / Math.abs(Number(previous))) * 100;
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  return Math.round(ratio * 10) / 10;
}

async function getDashboardSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  baseCurrency: string,
): Promise<DashboardSummary> {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const prevMonth = subMonths(now, 1);
  const prevStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
  const prevEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');
  const lastThirtyDaysStart = format(subDays(now, 29), 'yyyy-MM-dd');

  const baseQuery = () =>
    supabase
      .from('transactions')
      .select('base_amount_cents')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('is_transfer', false)
      .eq('is_excluded', false);

  const [
    { data: accounts },
    { data: monthIncomeRows },
    { data: monthExpenseRows },
    { data: prevIncomeRows },
    { data: prevExpenseRows },
    { data: lastThirtyExpenseRows },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('current_balance_cents,currency')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .eq('include_in_net_worth', true),
    baseQuery()
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .gt('base_amount_cents', 0),
    baseQuery()
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .lt('base_amount_cents', 0),
    baseQuery()
      .gte('transaction_date', prevStart)
      .lte('transaction_date', prevEnd)
      .gt('base_amount_cents', 0),
    baseQuery()
      .gte('transaction_date', prevStart)
      .lte('transaction_date', prevEnd)
      .lt('base_amount_cents', 0),
    baseQuery()
      .gte('transaction_date', lastThirtyDaysStart)
      .lte('transaction_date', today)
      .lt('base_amount_cents', 0),
  ]);

  const monthIncomeCents = sumRows(monthIncomeRows);
  const monthExpenseCents = sumRows(monthExpenseRows, true);
  const monthSavedCents = monthIncomeCents - monthExpenseCents;
  const prevIncomeCents = sumRows(prevIncomeRows);
  const prevExpenseCents = sumRows(prevExpenseRows, true);
  const prevSavedCents = prevIncomeCents - prevExpenseCents;
  const netChangePercent = calculatePercentChange(monthSavedCents, prevSavedCents);
  const avgDailyThirtyDaysCents = divideRounded(sumRows(lastThirtyExpenseRows, true), 30n);

  const conversionDate = today;
  const convertedBalances = await Promise.allSettled(
    (accounts ?? []).map(async (account) => {
      const balanceCents = BigInt(account.current_balance_cents);
      if (account.currency === baseCurrency) {
        return balanceCents;
      }
      const { baseCents } = await convertToBase(
        balanceCents,
        account.currency,
        baseCurrency,
        conversionDate,
      );
      return baseCents;
    }),
  );

  let totalBalanceCents = 0n;
  for (const result of convertedBalances) {
    if (result.status === 'fulfilled') {
      totalBalanceCents += result.value;
    }
  }

  return {
    totalBalanceCents,
    monthIncomeCents,
    monthExpenseCents,
    monthSavedCents,
    avgDailyThirtyDaysCents,
    netChangePercent,
  };
}

async function getRecentTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecentTransactionItem[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id,transaction_date,base_amount_cents,base_currency,merchant_raw,is_transfer,merchants(display_name),categories(name)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  return ((data as RecentTxRow[] | null) ?? []).map((row) => ({
    id: row.id,
    transactionDate: row.transaction_date,
    baseAmountCents: BigInt(row.base_amount_cents),
    baseCurrency: row.base_currency,
    merchantLabel:
      row.merchants?.display_name ??
      row.merchant_raw ??
      (row.is_transfer ? 'Transfer' : 'Nepoznato'),
    categoryLabel: row.categories?.name ?? (row.is_transfer ? 'Transfer' : 'Nerazvrstano'),
  }));
}

async function HeroSection({
  summaryPromise,
  baseCurrency,
}: {
  summaryPromise: Promise<DashboardSummary>;
  baseCurrency: string;
}) {
  const summary = await summaryPromise;
  return (
    <BalanceHero
      totalBalanceCents={summary.totalBalanceCents}
      baseCurrency={baseCurrency}
      netChangePercent={summary.netChangePercent}
    />
  );
}

async function MetricsSection({
  summaryPromise,
  baseCurrency,
}: {
  summaryPromise: Promise<DashboardSummary>;
  baseCurrency: string;
}) {
  const summary = await summaryPromise;
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MetricCard
        title="Potrošeno ovaj mjesec"
        amountCents={summary.monthExpenseCents}
        currency={baseCurrency}
        tone="expense"
      />
      <MetricCard
        title="Prihodi ovaj mjesec"
        amountCents={summary.monthIncomeCents}
        currency={baseCurrency}
        tone="income"
      />
      <MetricCard title="Sačuvano" amountCents={summary.monthSavedCents} currency={baseCurrency} />
      <MetricCard
        title="Prosječno dnevno (30 dana)"
        amountCents={summary.avgDailyThirtyDaysCents}
        currency={baseCurrency}
      />
    </section>
  );
}

async function RecentTransactionsSection({
  recentPromise,
}: {
  recentPromise: Promise<RecentTransactionItem[]>;
}) {
  const items = await recentPromise;
  return <RecentTransactions items={items} />;
}

export default async function PocetnaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,base_currency,timezone,onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  const baseCurrency = profile?.base_currency ?? 'BAM';
  const firstName = getFirstName(profile?.display_name ?? null, user.email);
  const greeting = getGreetingPart(profile?.timezone ?? 'Europe/Sarajevo');
  const showMotivation = !profile?.onboarding_completed_at;

  const summaryPromise = getDashboardSummary(supabase, user.id, baseCurrency);
  const recentPromise = getRecentTransactions(supabase, user.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <section className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}, {firstName}
        </h2>
        {showMotivation ? (
          <p className="text-sm text-muted-foreground sm:text-base">
            Odlično vrijeme da postaviš bazu: dodaj račun ili unesi prvu transakciju.
          </p>
        ) : null}
      </section>

      <Suspense fallback={<DashboardHeroSkeleton />}>
        <HeroSection summaryPromise={summaryPromise} baseCurrency={baseCurrency} />
      </Suspense>

      <Suspense fallback={<DashboardMetricsSkeleton />}>
        <MetricsSection summaryPromise={summaryPromise} baseCurrency={baseCurrency} />
      </Suspense>

      <Suspense fallback={<DashboardRecentTransactionsSkeleton />}>
        <RecentTransactionsSection recentPromise={recentPromise} />
      </Suspense>

      <TrendPlaceholder />
    </div>
  );
}
