'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PulseDonutChart,
  type SerializedCategorySpend,
} from '@/components/dashboard/pulse-donut-chart';
import type { SpendingPeriod } from '@/lib/queries/spending-by-category';

const PERIOD_LABELS: Record<SpendingPeriod, string> = {
  weekly: 'Tjedan',
  monthly: 'Mjesec',
  quarterly: '3 mjeseca',
  yearly: 'Godina',
};

const PERIOD_ORDER: SpendingPeriod[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

export interface PotrosnjaClientProps {
  period: SpendingPeriod;
  baseCurrency: string;
  rows: SerializedCategorySpend[];
  totalCents: string;
  /** Human-readable range label like "1. maj — 31. maj 2026.". */
  rangeLabel: string;
  /** ISO bounds matching the displayed period — used by drill-down links. */
  drillDownDateRange: { from: string; to: string };
}

export function PotrosnjaClient({
  period,
  baseCurrency,
  rows,
  totalCents,
  rangeLabel,
  drillDownDateRange,
}: PotrosnjaClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('period', next);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  return (
    <Card data-testid="potrosnja-page">
      <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-0.5">
          <CardTitle className="text-lg sm:text-xl">Potrošnja po kategorijama</CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">{rangeLabel}</p>
        </div>
        <Tabs value={period} onValueChange={setPeriod} className="self-start sm:self-auto">
          <TabsList aria-label="Period potrošnje">
            {PERIOD_ORDER.map((opt) => (
              <TabsTrigger key={opt} value={opt} className="px-3 text-xs sm:text-sm">
                {PERIOD_LABELS[opt]}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Hidden panels keep Radix happy (each trigger needs a target
              for aria-controls). The actual chart renders outside Tabs. */}
          {PERIOD_ORDER.map((opt) => (
            <TabsContent key={opt} value={opt} className="hidden" />
          ))}
        </Tabs>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {rows.length === 0 ? (
          <PotrosnjaEmptyState />
        ) : (
          <PulseDonutChart
            data={rows}
            currency={baseCurrency}
            totalCents={totalCents}
            variant="page"
            drillDownDateRange={drillDownDateRange}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PotrosnjaEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <PieChart className="h-10 w-10 text-emerald-500" aria-hidden />
      <p className="max-w-sm text-sm text-muted-foreground">
        U ovom periodu još nema potrošnje. Promijeni period ili dodaj transakciju.
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
