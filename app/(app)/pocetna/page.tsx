import { Suspense, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeletionCanceledToast } from '@/components/auth/deletion-canceled-toast';
import { BalanceHero } from '@/components/dashboard/balance-hero';
import {
  OnboardingWizard,
  type OnboardingProgress,
} from '@/components/onboarding/onboarding-wizard';
import type { BudgetableCategory } from '@/components/budgets/budget-form';
import type { GoalAccount } from '@/components/goals/goal-form';
import { BudgetsWidget } from '@/components/dashboard/budgets-widget';
import { ForecastWidget, type SerializedForecast } from '@/components/dashboard/forecast-widget';
import { InsightsWidget } from '@/components/dashboard/insights-widget';
import { MetricCard } from '@/components/dashboard/metric-card';
import {
  RecentTransactions,
  type RecentTransactionItem,
} from '@/components/dashboard/recent-transactions';
import { SortableDashboard } from '@/components/dashboard/sortable-dashboard';
import { SpendingByCategoryWidget } from '@/components/dashboard/spending-by-category-widget';
import {
  DashboardBudgetsSkeleton,
  DashboardForecastSkeleton,
  DashboardHeroSkeleton,
  DashboardInsightsSkeleton,
  DashboardMetricsSkeleton,
  DashboardRecentTransactionsSkeleton,
  DashboardSpendingByCategorySkeleton,
} from '@/components/dashboard/dashboard-skeletons';
import { SectionBoundary } from '@/components/dashboard/section-boundary';
import { WidgetErrorCard } from '@/components/dashboard/widget-error-card';
import { resolveSectionOrder, type DashboardSectionKey } from '@/lib/dashboard/sections';
import { withTimeout } from '@/lib/with-timeout';
import { fetchTransferCounterpartyAccountNames } from '@/lib/db/transfer-counterparty-names';
import { getTransactionPrimaryLabel } from '@/lib/format/transaction-primary-label';
import { forecastCashflow, type ForecastResult } from '@/lib/analytics/forecast';
import { listBudgetsWithSpent } from '@/lib/queries/budgets';
import { listInsights } from '@/lib/queries/insights';
import { getSpendingByCategory, type CategorySpendRow } from '@/lib/queries/spending-by-category';
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

/**
 * Bigints can't cross the RSC boundary natively. Stringify every cents
 * value and the chart-internal balance ones too, then the Client widget
 * deserialises with `BigInt(...)`.
 */
function serialiseForecast(f: ForecastResult): SerializedForecast {
  return {
    baseCurrency: f.baseCurrency,
    startBalanceCents: f.startBalanceCents.toString(),
    startDate: f.startDate,
    daysAhead: f.daysAhead,
    projections: f.projections.map((d) => ({
      date: d.date,
      balanceCents: d.balanceCents.toString(),
      inflowCents: d.inflowCents.toString(),
      outflowCents: d.outflowCents.toString(),
      events: d.events.map((e) => ({
        type: e.type,
        description: e.description,
        amountCents: e.amountCents.toString(),
        sourceId: e.sourceId,
      })),
    })),
    lowestPoint: f.lowestPoint
      ? { date: f.lowestPoint.date, balanceCents: f.lowestPoint.balanceCents.toString() }
      : null,
    baselineInflowCents: f.baselineInflowCents.toString(),
    baselineOutflowCents: f.baselineOutflowCents.toString(),
    warnings: f.warnings,
  };
}

const PERIOD_LABEL_BS: Record<string, string> = {
  weekly: 'sedmično',
  'bi-weekly': 'svake 2 sedmice',
  monthly: 'mjesečno',
  quarterly: 'kvartalno',
  yearly: 'godišnje',
};

interface ForecastInfluencesRow {
  recurring: {
    id: string;
    description: string;
    averageAmountCents: number;
    currency: string;
    periodLabel: string;
    pausedUntil: string | null;
  }[];
  installments: {
    id: string;
    label: string;
    totalCount: number;
    installmentCents: number;
    currency: string;
    dayOfMonth: number;
  }[];
}

async function ForecastSection({
  forecastPromise,
  influencesPromise,
}: {
  forecastPromise: Promise<ForecastResult>;
  influencesPromise: Promise<ForecastInfluencesRow>;
}) {
  const [result, influences] = await Promise.all([forecastPromise, influencesPromise]);
  return (
    <ForecastWidget
      forecast={serialiseForecast(result)}
      recurring={influences.recurring}
      installments={influences.installments}
    />
  );
}

async function SpendingByCategorySection({
  spendingPromise,
  summaryPromise,
  baseCurrency,
}: {
  spendingPromise: Promise<CategorySpendRow[]>;
  summaryPromise: Promise<MonthlySummary>;
  baseCurrency: string;
}) {
  const [rows, summary] = await Promise.all([spendingPromise, summaryPromise]);
  return (
    <SpendingByCategoryWidget
      spendingPromise={Promise.resolve(rows)}
      baseCurrency={baseCurrency}
      totalCents={summary.monthExpense}
    />
  );
}

async function loadForecastInfluences(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ForecastInfluencesRow> {
  const [recRes, instRes] = await Promise.all([
    supabase
      .from('recurring_transactions')
      .select('id, description, average_amount_cents, currency, period, paused_until')
      .eq('user_id', userId)
      .eq('active', true)
      .order('average_amount_cents', { ascending: true }),
    supabase
      .from('installment_plans')
      .select('id, notes, installment_count, installment_cents, currency, day_of_month')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('day_of_month'),
  ]);

  const recurring = (recRes.data ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    averageAmountCents: r.average_amount_cents,
    currency: r.currency,
    periodLabel: PERIOD_LABEL_BS[r.period] ?? r.period,
    pausedUntil: r.paused_until,
  }));
  const installments = (instRes.data ?? []).map((i) => ({
    id: i.id,
    label: i.notes ?? 'Plan otplate',
    totalCount: i.installment_count,
    installmentCents: i.installment_cents,
    currency: i.currency,
    dayOfMonth: i.day_of_month,
  }));
  return { recurring, installments };
}

/**
 * Coerces unknown JSON from the DB into the strict OnboardingProgress shape.
 * Tolerates older rows with missing keys and never trusts arbitrary jsonb
 * input — only `boolean` values pass through.
 */
function normalizeProgress(raw: unknown): OnboardingProgress {
  const out: OnboardingProgress = { step1: false, step2: false, step3: false, step4: false };
  if (typeof raw !== 'object' || raw === null) return out;
  const obj = raw as Record<string, unknown>;
  if (obj.step1 === true) out.step1 = true;
  if (obj.step2 === true) out.step2 = true;
  if (obj.step3 === true) out.step3 = true;
  if (obj.step4 === true) out.step4 = true;
  return out;
}

interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  kind: string;
}

/**
 * Server Component that fetches the wizard's input data (categories for the
 * Budget step, accounts for the Goal step) and renders the client wizard.
 * Kept separate from the main `PocetnaPage` body so the wizard's
 * dependencies don't pay parallel dispatch cost when the dashboard renders.
 */
async function OnboardingGate({
  baseCurrency,
  progress,
  supabase,
  userId,
}: {
  baseCurrency: string;
  progress: OnboardingProgress;
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const [categoriesRes, accountsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, icon, kind')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('kind', ['expense', 'saving'])
      .order('sort_order', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ]);

  const categories: BudgetableCategory[] = (categoriesRes.data ?? [])
    .filter(
      (c): c is CategoryRow & { kind: 'expense' | 'saving' } =>
        c.kind === 'expense' || c.kind === 'saving',
    )
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind }));

  const accounts: GoalAccount[] = (accountsRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));

  return (
    <OnboardingWizard
      progress={progress}
      categories={categories}
      accounts={accounts}
      baseCurrency={baseCurrency}
    />
  );
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
    .select(
      'display_name,base_currency,timezone,onboarding_completed_at,onboarding_completed,dashboard_section_order',
    )
    .eq('id', user.id)
    .maybeSingle();

  const baseCurrency = profile?.base_currency ?? 'BAM';
  const firstName = getFirstName(profile?.display_name ?? null, user.email);
  const greeting = getGreetingPart(safeIanaTimeZone(profile?.timezone));

  // ── Onboarding wizard gate ────────────────────────────────────────────────
  // Show the wizard when:
  //   1. The user has NOT completed onboarding (no terminal timestamp), AND
  //   2. They have no accounts AND no transactions (truly fresh — not a
  //      legacy user with the timestamp never set).
  // The accounts/transactions guard prevents resurrecting the wizard for
  // users who pre-date the column. They'll keep `onboarding_completed_at`
  // null forever, but having any data means they're past the wizard's UX.
  if (profile?.onboarding_completed_at === null || profile?.onboarding_completed_at === undefined) {
    const [accountsCheck, txCheck] = await Promise.all([
      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('deleted_at', null),
    ]);
    const hasAccounts = (accountsCheck.count ?? 0) > 0;
    const hasTransactions = (txCheck.count ?? 0) > 0;

    if (!hasAccounts && !hasTransactions) {
      return (
        <OnboardingGate
          baseCurrency={baseCurrency}
          progress={normalizeProgress(profile?.onboarding_completed)}
          supabase={supabase}
          userId={user.id}
        />
      );
    }
  }

  // Resolve once and reuse — `resolveSummaryDateParts` is pure but we
  // also feed `todayDate` into `getSpendingByCategory` below to keep the
  // RPC's day boundary aligned with `getMonthlySummary` for the same TZ.
  const dateParts = resolveSummaryDateParts(profile?.timezone);

  // AV-9: every dashboard query is wrapped in `withTimeout` so a hung query
  // can't keep its Suspense boundary in skeleton state forever. 5000ms is
  // 10× the typical Supabase query latency (most resolve in <500ms); a
  // timeout that fires here is a real signal of a stuck query, not a
  // false positive. The TimeoutError propagates to the section's
  // `<SectionBoundary>` which renders a `<WidgetErrorCard>` fallback —
  // sibling widgets keep streaming in unaffected. Sentry (PR-2) captures
  // the error with `tags.sectionId` so we can grep "which widget hangs
  // most often" in the Issues view.
  const QUERY_TIMEOUT_MS = 5000;

  const summaryPromise = withTimeout(
    getMonthlySummary(supabase, user.id, baseCurrency, dateParts),
    QUERY_TIMEOUT_MS,
    'summary',
  );
  const recentPromise = withTimeout(
    getRecentTransactions(supabase, user.id),
    QUERY_TIMEOUT_MS,
    'recent_transactions',
  );
  // Fired in parallel with the other dashboard fetches; the widget awaits
  // it inside its own Suspense boundary so the rest of the page still
  // streams in independently.
  const budgetsPromise = withTimeout(
    listBudgetsWithSpent(supabase, user.id, { onlyActive: true }),
    QUERY_TIMEOUT_MS,
    'budgets',
  );
  // Forecast: server fetches the 90-day window once; the widget client-
  // side toggles between 30/60/90 by slicing without a refetch.
  const forecastPromise = withTimeout(
    forecastCashflow(supabase, user.id, 90, { baseCurrency }),
    QUERY_TIMEOUT_MS,
    'forecast',
  );
  // Active recurring + installment summary so the widget can render the
  // "Šta utiče na projekciju" section without a second client fetch.
  const forecastInfluencesPromise = withTimeout(
    loadForecastInfluences(supabase, user.id),
    QUERY_TIMEOUT_MS,
    'forecast_influences',
  );
  // Top 3 active insights for the dashboard widget. Engine writes nightly;
  // we just read the freshest active rows here.
  const insightsPromise = withTimeout(
    listInsights(supabase, user.id, { mode: 'active', limit: 3 }),
    QUERY_TIMEOUT_MS,
    'insights',
  );
  // Spending-by-category za "Pulse Donut" widget. Tekući kalendarski mjesec
  // u korisničkoj TZ; `dateParts.todayDate` osigurava poklapanje prozora
  // s `monthExpense`-om kojeg widget koristi za centar donut-a.
  const spendingByCategoryPromise = withTimeout(
    getSpendingByCategory(supabase, {
      period: 'monthly',
      offset: 0,
      baseCurrency,
      todayDate: dateParts.todayDate,
    }),
    QUERY_TIMEOUT_MS,
    'spending_by_category',
  );

  const sectionOrder = resolveSectionOrder(profile?.dashboard_section_order);

  // Slot map: server-rendered sections handed to the client wrapper as
  // ReactNodes. The wrapper renders only those listed in `sectionOrder`
  // (the rest go into the "Hidden" tray in edit mode). All data fetches
  // above are dispatched in parallel regardless of visibility — the cost
  // is one or two unused promises for hidden sections, which is fine
  // since most users keep most widgets visible.
  //
  // AV-9: each Suspense is wrapped in a <SectionBoundary> that catches
  // the timeout/rejection and renders <WidgetErrorCard> in place — the
  // section breaks gracefully instead of escalating to the segment-level
  // error.tsx (which would tear down every other widget too).
  const slots: Record<DashboardSectionKey, ReactNode> = {
    hero: (
      <SectionBoundary sectionId="hero" fallback={<WidgetErrorCard label="Saldo" />}>
        <Suspense fallback={<DashboardHeroSkeleton />}>
          <HeroSection
            summaryPromise={summaryPromise}
            baseCurrency={baseCurrency}
            greeting={greeting}
            firstName={firstName}
          />
        </Suspense>
      </SectionBoundary>
    ),
    donut: (
      <SectionBoundary
        sectionId="donut"
        fallback={<WidgetErrorCard label="Potrošnja po kategorijama" />}
      >
        <Suspense fallback={<DashboardSpendingByCategorySkeleton />}>
          <SpendingByCategorySection
            spendingPromise={spendingByCategoryPromise}
            summaryPromise={summaryPromise}
            baseCurrency={baseCurrency}
          />
        </Suspense>
      </SectionBoundary>
    ),
    forecast: (
      <SectionBoundary sectionId="forecast" fallback={<WidgetErrorCard label="Projekcija" />}>
        <Suspense fallback={<DashboardForecastSkeleton />}>
          <ForecastSection
            forecastPromise={forecastPromise}
            influencesPromise={forecastInfluencesPromise}
          />
        </Suspense>
      </SectionBoundary>
    ),
    budgets: (
      <SectionBoundary sectionId="budgets" fallback={<WidgetErrorCard label="Budžeti" />}>
        <Suspense fallback={<DashboardBudgetsSkeleton />}>
          <BudgetsWidget budgetsPromise={budgetsPromise} />
        </Suspense>
      </SectionBoundary>
    ),
    insights: (
      <SectionBoundary sectionId="insights" fallback={<WidgetErrorCard label="Uvidi" />}>
        <Suspense fallback={<DashboardInsightsSkeleton />}>
          <InsightsWidget insightsPromise={insightsPromise} />
        </Suspense>
      </SectionBoundary>
    ),
    recent_tx: (
      <SectionBoundary
        sectionId="recent_tx"
        fallback={<WidgetErrorCard label="Posljednje transakcije" />}
      >
        <Suspense fallback={<DashboardRecentTransactionsSkeleton />}>
          <RecentTransactionsSection recentPromise={recentPromise} />
        </Suspense>
      </SectionBoundary>
    ),
    metrics: (
      <SectionBoundary sectionId="metrics" fallback={<WidgetErrorCard label="Mjesečni pregled" />}>
        <Suspense fallback={<DashboardMetricsSkeleton />}>
          <MetricsSection summaryPromise={summaryPromise} baseCurrency={baseCurrency} />
        </Suspense>
      </SectionBoundary>
    ),
  };

  return (
    <SortableDashboard initialOrder={sectionOrder} slots={slots}>
      <Suspense fallback={null}>
        <DeletionCanceledToast />
      </Suspense>
    </SortableDashboard>
  );
}
