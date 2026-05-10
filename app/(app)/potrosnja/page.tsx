import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { computeDateRange } from '@/lib/dates/compute-period-range';
import { createClient } from '@/lib/supabase/server';
import {
  getSpendingByCategory,
  type CategorySpendRow,
  type SpendingPeriod,
} from '@/lib/queries/spending-by-category';
import { resolveSummaryDateParts } from '@/lib/queries/summary';
import { PotrosnjaClient } from './potrosnja-client';
import type { SerializedCategorySpend } from '@/components/dashboard/pulse-donut-chart';

export const metadata: Metadata = {
  title: 'Potrošnja po kategorijama — Konto',
};

const VALID_PERIODS: SpendingPeriod[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

function isValidPeriod(value: unknown): value is SpendingPeriod {
  return typeof value === 'string' && (VALID_PERIODS as string[]).includes(value);
}

// MT-8: `computeDateRange` extracted to `lib/dates/compute-period-range.ts`
// so its lock-step contract with SQL RPC `get_spending_by_category`
// (migration 00062) is testable in isolation. See the lib for the full
// contract notes (weekly/monthly/quarterly/yearly window definitions).

function serialise(rows: CategorySpendRow[]): SerializedCategorySpend[] {
  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    icon: r.icon,
    color: r.color,
    slug: r.slug,
    amountCents: r.amountCents.toString(),
    prevAmountCents: r.prevAmountCents.toString(),
    monthlyHistory: r.monthlyHistory.map((c) => c.toString()),
  }));
}

interface PotrosnjaPageProps {
  searchParams: Promise<{ period?: string | string[] }>;
}

export default async function PotrosnjaPage({ searchParams }: PotrosnjaPageProps) {
  const params = await searchParams;
  const periodCandidate = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: SpendingPeriod = isValidPeriod(periodCandidate) ? periodCandidate : 'monthly';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency,timezone')
    .eq('id', user.id)
    .maybeSingle();

  const baseCurrency = profile?.base_currency ?? 'BAM';
  const dateParts = resolveSummaryDateParts(profile?.timezone);
  const range = computeDateRange(period, dateParts.todayDate);

  const rows = await getSpendingByCategory(supabase, {
    period,
    offset: 0,
    baseCurrency,
    todayDate: dateParts.todayDate,
  });

  const totalCents = rows.reduce((acc, r) => acc + r.amountCents, 0n);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PotrosnjaClient
        period={period}
        baseCurrency={baseCurrency}
        rows={serialise(rows)}
        totalCents={totalCents.toString()}
        rangeLabel={range.label}
        drillDownDateRange={{ from: range.from, to: range.to }}
      />
    </div>
  );
}
