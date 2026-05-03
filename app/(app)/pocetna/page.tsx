import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeletionCanceledToast } from '@/components/auth/deletion-canceled-toast';
import { BalanceHero } from '@/components/dashboard/balance-hero';
import { BudgetsWidget } from '@/components/dashboard/budgets-widget';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  RecentTransactions,
  type RecentTransactionItem,
} from '@/components/dashboard/recent-transactions';
import {
  DashboardBudgetsSkeleton,
  DashboardHeroSkeleton,
  DashboardMetricsSkeleton,
  DashboardRecentTransactionsSkeleton,
} from '@/components/dashboard/dashboard-skeletons';
import { PullToRefreshWrapper } from '@/components/shell/pull-to-refresh-wrapper';
import { fetchTransferCounterpartyAccountNames } from '@/lib/db/transfer-counterparty-names';
import { getTransactionPrimaryLabel } from '@/lib/format/transaction-primary-label';
import { listBudgetsWithSpent } from '@/lib/queries/budgets';
import {
  getMonthlySummary,
  resolveSummaryDateParts,
  type MonthlySummary,
} from '@/lib/queries/summary';
import { safeIanaTimeZone } from '@/lib/safe-timezone';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

interface RecentTxRow {
  id: string;
  transaction_date: string;
  base_amount_cents: number;
  base_currency: string;
  original_amount_cents: number;
  merchant_raw: string | null;
  description: string | null;
  is_transfer: boolean;
  transfer_pair_id: string | null;
  merchants: { display_name: string } | null;
  categories: { name: string } | null;
  accounts: { name: string } | null;
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

async function getRecentTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecentTransactionItem[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id,transaction_date,base_amount_cents,base_currency,original_amount_cents,merchant_raw,description,is_transfer,transfer_pair_id,merchants(display_name),categories(name),accounts(name)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  const rows = (data as RecentTxRow[] | null) ?? [];
  const pairTargets = [
    ...new Set(rows.map((row) => row.transfer_pair_id).filter((id): id is string => id !== null)),
  ];
  const counterpartyNames = await fetchTransferCounterpartyAccountNames(
    supabase,
    userId,
    pairTargets,
  );

  return rows.map((row) => ({
    id: row.id,
    transactionDate: row.transaction_date,
    baseAmountCents: BigInt(row.base_amount_cents),
    baseCurrency: row.base_currency,
    merchantLabel: getTransactionPrimaryLabel({
      merchant_display_name: row.merchants?.display_name,
      merchant_raw: row.merchant_raw,
      description: row.description,
      is_transfer: row.is_transfer,
      original_amount_cents: row.original_amount_cents,
      account_name: row.accounts?.name ?? null,
      transfer_counterparty_account_name: row.transfer_pair_id
        ? (counterpartyNames.get(row.transfer_pair_id) ?? null)
        : null,
    }),
    categoryLabel: row.categories?.name ?? (row.is_transfer ? 'Transfer' : 'Nerazvrstano'),
  }));
}

/** True when summary tells us the account is brand-new with no activity.
 * Out-of-scope liabilities also count — a fresh user with just a stambeni
 * kredit (loan with `include_in_net_worth=false`) is NOT empty: they need
 * to see the loan, not the empty-state copy. */
function isSummaryEmpty(summary: MonthlySummary): boolean {
  return (
    summary.totalBalance === 0n &&
    summary.totalLiabilities === 0n &&
    summary.outOfScopeLiabilities === 0n &&
    summary.monthIncome === 0n &&
    summary.monthExpense === 0n
  );
}

async function HeroSection({
  summaryPromise,
  baseCurrency,
  greeting,
  firstName,
}: {
  summaryPromise: Promise<MonthlySummary>;
  baseCurrency: string;
  greeting: string;
  firstName: string;
}) {
  const summary = await summaryPromise;
  // Empty-state copy ("Odlično vrijeme da postaviš bazu…") only makes sense
  // when the user really has no data yet. Pre-redesign this was gated on
  // `onboarding_completed_at`, which stayed null even after activity, so the
  // motivational subtitle kept reappearing on populated dashboards (audit D1).
  const showMotivation = isSummaryEmpty(summary);

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h2 className="text-headline sm:text-3xl sm:font-semibold">
          {greeting}, {firstName}
        </h2>
        {showMotivation ? (
          <p className="text-caption text-muted-foreground">
            Odlično vrijeme da postaviš bazu: dodaj račun ili unesi prvu transakciju.
          </p>
        ) : null}
      </section>

      <BalanceHero
        totalBalanceCents={summary.totalBalance}
        totalLiabilitiesCents={summary.totalLiabilities}
        outOfScopeLiabilitiesCents={summary.outOfScopeLiabilities}
        outOfScopeLiabilityCount={summary.outOfScopeLiabilityCount}
        baseCurrency={baseCurrency}
        netChangePercent={summary.netChangePercent}
      />
    </div>
  );
}

async function MetricsSection({
  summaryPromise,
  baseCurrency,
}: {
  summaryPromise: Promise<MonthlySummary>;
  baseCurrency: string;
}) {
  const summary = await summaryPromise;
  return (
    <section aria-label="Mjesečni pregled" className="grid grid-cols-2 gap-3 sm:gap-4">
      <MetricCard
        title="Potrošnja"
        amountCents={summary.monthExpense}
        currency={baseCurrency}
        tone="expense"
      />
      <MetricCard
        title="Prihodi"
        amountCents={summary.monthIncome}
        currency={baseCurrency}
        tone="income"
      />
      <MetricCard title="Sačuvano" amountCents={summary.monthNet} currency={baseCurrency} />
      <MetricCard title="Dnevno" amountCents={summary.avgDailySpend} currency={baseCurrency} />
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
  const greeting = getGreetingPart(safeIanaTimeZone(profile?.timezone));

  const summaryPromise = getMonthlySummary(
    supabase,
    user.id,
    baseCurrency,
    resolveSummaryDateParts(profile?.timezone),
  );
  const recentPromise = getRecentTransactions(supabase, user.id);
  // Fired in parallel with the other dashboard fetches; the widget awaits
  // it inside its own Suspense boundary so the rest of the page still
  // streams in independently.
  const budgetsPromise = listBudgetsWithSpent(supabase, user.id, { onlyActive: true });

  return (
    <PullToRefreshWrapper
      className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6"
      refreshLabel="Osvježavam dashboard..."
    >
      <Suspense fallback={null}>
        <DeletionCanceledToast />
      </Suspense>

      <Suspense fallback={<DashboardHeroSkeleton />}>
        <HeroSection
          summaryPromise={summaryPromise}
          baseCurrency={baseCurrency}
          greeting={greeting}
          firstName={firstName}
        />
      </Suspense>

      <Suspense fallback={<DashboardMetricsSkeleton />}>
        <MetricsSection summaryPromise={summaryPromise} baseCurrency={baseCurrency} />
      </Suspense>

      <Suspense fallback={<DashboardBudgetsSkeleton />}>
        <BudgetsWidget budgetsPromise={budgetsPromise} />
      </Suspense>

      <Suspense fallback={<DashboardRecentTransactionsSkeleton />}>
        <RecentTransactionsSection recentPromise={recentPromise} />
      </Suspense>
    </PullToRefreshWrapper>
  );
}
