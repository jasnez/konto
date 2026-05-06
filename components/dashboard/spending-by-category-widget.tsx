import Link from 'next/link';
import { ArrowRight, PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CategorySpendRow } from '@/lib/queries/spending-by-category';
import { PulseDonutChart, type SerializedCategorySpend } from './pulse-donut-chart';

/**
 * Dashboard widget for /pocetna — "Pulse Donut" pregled top 5 kategorija
 * potrošnje za tekući mjesec, s mini sparkline trendom (zadnja 3 mjeseca)
 * i strelicom vs prošli mjesec po kategoriji.
 *
 * Server Component: prima pre-resolved `Promise<CategorySpendRow[]>` da
 * roditelj može dispatchati fetch paralelno sa ostalim dashboard sekcijama
 * (mirror summaryPromise patterna u pocetna/page.tsx).
 *
 * RSC bigint policy: serializiramo cents-vrijednosti u stringove prije
 * predaje klijentskoj komponenti, koja ih deserialise-a kroz `BigInt(...)`.
 */

export interface SpendingByCategoryWidgetProps {
  spendingPromise: Promise<CategorySpendRow[]>;
  baseCurrency: string;
  /** Ukupna potrošnja za tekući mjesec (centar donut-a). */
  totalCents: bigint;
}

const TOP_N = 5;

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

export async function SpendingByCategoryWidget({
  spendingPromise,
  baseCurrency,
  totalCents,
}: SpendingByCategoryWidgetProps) {
  const rows = await spendingPromise;

  // Hide the uncategorised bucket from the dashboard widget — it's noise
  // for the at-a-glance view. Page surface still shows it as a row.
  const named = rows.filter((r) => r.categoryId !== null);
  const top = named.slice(0, TOP_N);

  return (
    <Card data-testid="spending-by-category-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <CardTitle className="text-lg">Potrošnja po kategorijama</CardTitle>
        <Link
          href="/potrosnja"
          className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Vidi sve
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {top.length === 0 ? (
          <SpendingByCategoryEmptyState />
        ) : (
          <PulseDonutChart
            data={serialise(top)}
            currency={baseCurrency}
            totalCents={totalCents.toString()}
            variant="widget"
          />
        )}
      </CardContent>
    </Card>
  );
}

function SpendingByCategoryEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <PieChart className="h-8 w-8 text-emerald-500" aria-hidden />
      <p className="max-w-sm text-sm text-muted-foreground">
        Još nema potrošnje ovaj mjesec. Dodaj transakciju da vidiš pregled po kategorijama.
      </p>
      <Link
        href="/transakcije/nova"
        className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
      >
        Dodaj transakciju
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
