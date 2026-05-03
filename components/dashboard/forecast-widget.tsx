'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, Check, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/format-money';
import type { ForecastDay, ForecastEvent } from '@/lib/analytics/forecast';
import { ForecastChart } from './forecast-chart';

/**
 * Dashboard widget for /pocetna — Recharts line chart with 30/60/90
 * day toggle plus runway-warning footer. Server fetches 90 days once
 * and the client slices for the active tab; tab switches are instant
 * (no refetch).
 *
 * Empty state when the forecast was unable to compute anything
 * useful: zero start balance + zero events. The "Treba ti istorije"
 * warning from the algorithm is rendered as a non-blocking banner —
 * the chart still shows projected recurring/installment events even
 * without baseline.
 */

export type ForecastWindow = 30 | 60 | 90;

const WINDOW_OPTIONS: ForecastWindow[] = [30, 60, 90];

/**
 * Wire-compatible shape: the Server Component fetches a forecast,
 * stringifies bigints (RSC boundary), and passes this in. The widget
 * deserialises before handing off to the chart.
 */
export interface SerializedForecastDay {
  date: string;
  balanceCents: string;
  inflowCents: string;
  outflowCents: string;
  events: SerializedForecastEvent[];
}

export interface SerializedForecastEvent {
  type: 'recurring' | 'installment' | 'baseline';
  description: string;
  amountCents: string;
  sourceId?: string;
}

export interface SerializedForecast {
  baseCurrency: string;
  startBalanceCents: string;
  startDate: string;
  daysAhead: number;
  projections: SerializedForecastDay[];
  lowestPoint: { date: string; balanceCents: string } | null;
  warnings: string[];
}

export interface ForecastWidgetProps {
  forecast: SerializedForecast;
}

function deserialiseDay(d: SerializedForecastDay): ForecastDay {
  return {
    date: d.date,
    balanceCents: BigInt(d.balanceCents),
    inflowCents: BigInt(d.inflowCents),
    outflowCents: BigInt(d.outflowCents),
    events: d.events.map<ForecastEvent>((e) => ({
      type: e.type,
      description: e.description,
      amountCents: BigInt(e.amountCents),
      sourceId: e.sourceId,
    })),
  };
}

/**
 * Recompute lowest point + runway over an arbitrary slice. We don't
 * trust the server-provided one because the active tab may show a
 * shorter window than what the server analysed (server: 90 → client
 * slice: 30 means runway/lowest may differ).
 */
function summariseSlice(days: ForecastDay[]): {
  lowest: { date: string; balanceCents: bigint } | null;
  runwayDays: number | null;
} {
  if (days.length === 0) return { lowest: null, runwayDays: null };
  let lowest = { date: days[0].date, balanceCents: days[0].balanceCents };
  let runwayDays: number | null = null;
  for (let i = 0; i < days.length; i += 1) {
    const d = days[i];
    if (d.balanceCents < lowest.balanceCents) {
      lowest = { date: d.date, balanceCents: d.balanceCents };
    }
    if (runwayDays === null && d.balanceCents < 0n) {
      runwayDays = i + 1;
    }
  }
  return { lowest, runwayDays };
}

function formatHumanDate(iso: string): string {
  return format(parseISO(iso), 'd. MMM yyyy.', { locale: bs });
}

export function ForecastWidget({ forecast }: ForecastWidgetProps) {
  const [days, setDays] = useState<ForecastWindow>(30);

  const fullProjection = useMemo<ForecastDay[]>(
    () => forecast.projections.map(deserialiseDay),
    [forecast.projections],
  );

  const slice = useMemo<ForecastDay[]>(() => fullProjection.slice(0, days), [fullProjection, days]);

  const { lowest, runwayDays } = useMemo(() => summariseSlice(slice), [slice]);

  // Trend hint for chart line color: down when end < start over the
  // active slice. Uses BigInt comparison directly — no Number cast
  // needed for a sign check.
  const startBalance = BigInt(forecast.startBalanceCents);
  const endBalance = slice.length > 0 ? slice[slice.length - 1].balanceCents : startBalance;
  const trendDown = endBalance < startBalance;

  const insufficientHistoryWarning = forecast.warnings.find((w) => w.includes('istorije'));
  const isEmpty =
    slice.length === 0 ||
    (startBalance === 0n &&
      slice.every((d) => d.balanceCents === 0n && d.events.every((e) => e.type === 'baseline')));

  return (
    <Card data-testid="forecast-widget">
      <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <CardTitle className="text-lg">Projekcija</CardTitle>
        <Tabs
          value={String(days)}
          onValueChange={(v) => {
            const parsed = Number(v);
            if (parsed === 30 || parsed === 60 || parsed === 90) {
              setDays(parsed);
            }
          }}
          className="self-start sm:self-auto"
        >
          <TabsList aria-label="Period projekcije">
            {WINDOW_OPTIONS.map((opt) => (
              <TabsTrigger key={opt} value={String(opt)} className="px-3">
                {opt} dana
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Hidden panels are required by Radix Tabs so each trigger's
              aria-controls points to a real DOM element (WCAG / axe). The
              chart lives outside the Tabs component intentionally — we only
              use Tabs for the keyboard-navigable toggle chrome. */}
          {WINDOW_OPTIONS.map((opt) => (
            <TabsContent key={opt} value={String(opt)} className="hidden" />
          ))}
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {isEmpty ? (
          <ForecastEmptyState />
        ) : (
          <ForecastChart days={slice} currency={forecast.baseCurrency} trendDown={trendDown} />
        )}

        {insufficientHistoryWarning && !isEmpty && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {insufficientHistoryWarning}
          </p>
        )}

        {!isEmpty && (
          <RunwayStripe
            runwayDays={runwayDays}
            daysAhead={days}
            lowestPoint={lowest}
            currency={forecast.baseCurrency}
          />
        )}
      </CardContent>
    </Card>
  );
}

function RunwayStripe({
  runwayDays,
  daysAhead,
  lowestPoint,
  currency,
}: {
  runwayDays: number | null;
  daysAhead: number;
  lowestPoint: { date: string; balanceCents: bigint } | null;
  currency: string;
}) {
  // Already in the red.
  if (runwayDays !== null && runwayDays <= 1) {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
          'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Saldo je već ispod nule — razmotri smanjenje pretplata ili dopunu računa.</span>
      </div>
    );
  }

  // Will cross zero inside the visible window.
  if (runwayDays !== null) {
    const date = lowestPoint ? formatHumanDate(lowestPoint.date) : `~${String(runwayDays)} dana`;
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
          'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Negativan saldo očekivan {date} —{' '}
          <Link href="/pretplate" className="font-medium underline underline-offset-2">
            provjeri pretplate
          </Link>
          .
        </span>
      </div>
    );
  }

  // Stayed positive.
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      )}
    >
      <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Novac će istrajati barem {String(daysAhead)} dana
        {lowestPoint
          ? ` (najniža tačka: ${formatMoney(lowestPoint.balanceCents, currency, 'bs-BA', {
              showCurrency: true,
            })} ${formatHumanDate(lowestPoint.date)})`
          : ''}
        .
      </span>
    </div>
  );
}

function ForecastEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <span aria-hidden className="text-3xl">
        <Sparkles className="h-8 w-8 text-emerald-500" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        Dodaj prvu transakciju ili potvrdi pretplatu da vidiš projekciju budućeg salda.
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
