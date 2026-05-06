import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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

/**
 * Date range whose bounds match the SQL RPC's period window. Kept in lock-
 * step with `get_spending_by_category` (00062 migration) so drill-down
 * links land on /transakcije pre-filtered to exactly the period whose
 * rows the user just clicked on.
 *
 * Returns ISO YYYY-MM-DD strings; both bounds are inclusive on the UI
 * side (the SQL is half-open but the transakcije page treats `to` as
 * inclusive — see app/(app)/transakcije/page.tsx parseFilters).
 */
function computeDateRange(
  period: SpendingPeriod,
  todayIso: string,
): { from: string; to: string; label: string } {
  // Parse YYYY-MM-DD as a UTC date so we don't pull in the host TZ here.
  const [yStr, mStr, dStr] = todayIso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const today = new Date(Date.UTC(y, m - 1, d));

  const fmt = (date: Date): string => date.toISOString().slice(0, 10);
  const human = (date: Date): string =>
    new Intl.DateTimeFormat('bs-BA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);

  let start: Date;
  let endExclusive: Date;

  if (period === 'weekly') {
    // ISO week: Monday = 1; date_trunc('week', …) lands on Monday.
    const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
    start = new Date(Date.UTC(y, m - 1, d - (dow - 1)));
    endExclusive = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    start = new Date(Date.UTC(y, m - 1, 1));
    endExclusive = new Date(Date.UTC(y, m, 1));
  } else if (period === 'quarterly') {
    // Rolling 3 months ending today (inclusive). Mirror RPC: end = today + 1 day.
    endExclusive = new Date(Date.UTC(y, m - 1, d + 1));
    start = new Date(Date.UTC(y, m - 1 - 3, d + 1));
  } else {
    start = new Date(Date.UTC(y, 0, 1));
    endExclusive = new Date(Date.UTC(y + 1, 0, 1));
  }

  // Convert exclusive end to inclusive end (last day of the window) for
  // /transakcije's `to` filter and human-readable labels.
  const inclusiveEnd = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);

  return {
    from: fmt(start),
    to: fmt(inclusiveEnd),
    label: `${human(start)} — ${human(inclusiveEnd)}`,
  };
}

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
