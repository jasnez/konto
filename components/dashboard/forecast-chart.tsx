'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';
import type { ForecastDay, ForecastEvent } from '@/lib/analytics/forecast';

/**
 * Pure chart for the dashboard Forecast widget. Stays separate from
 * `forecast-widget.tsx` so the widget can decide tab/runway concerns
 * while the chart focuses on rendering an array of `ForecastDay` rows.
 *
 * Dot logic: hide every-day dots (90 dots clutter the line); only mark
 * days that carry a non-baseline event (recurring or installment).
 * Tooltip lists those events with their amount + name.
 */

export interface ForecastChartProps {
  /** Day-by-day projection. Already trimmed by parent to the active tab. */
  days: ForecastDay[];
  /** Currency for tick + tooltip formatting. */
  currency: string;
  /** Whether the trend over the displayed window is downward. Picks line color. */
  trendDown: boolean;
}

interface ChartRow {
  date: string;
  /** Cents → number (Recharts wants finite numbers). Bigint safe-converted. */
  balance: number;
  /** Pretty-formatted via formatMoney for tooltip. */
  balanceLabel: string;
  inflowCents: bigint;
  outflowCents: bigint;
  events: ForecastEvent[];
}

/** Cents → JS number for chart use only. Bigint > 2^53 would lose
 *  precision but realistic balances are far below that bound; the
 *  source of truth in projections stays bigint. */
function centsToNumber(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (b < -BigInt(Number.MAX_SAFE_INTEGER)) return -Number.MAX_SAFE_INTEGER;
  return Number(b);
}

interface TooltipPayloadEntry {
  payload: ChartRow;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  currency: string;
}

export function ChartTooltip({ active, payload, currency }: ChartTooltipProps): React.ReactNode {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const formattedDate = format(parseISO(row.date), 'd. MMM yyyy.', { locale: bs });
  // Show every event (incl. baseline); baseline first so the user sees
  // "Prosječna dnevna potrošnja" even on days with no recurring/installment.
  const baselineFirst = [...row.events].sort((a, b) => {
    if (a.type === 'baseline') return -1;
    if (b.type === 'baseline') return 1;
    return 0;
  });
  const net = row.inflowCents - row.outflowCents;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{formattedDate}</div>
      <div className="font-mono tabular-nums">{row.balanceLabel}</div>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t pt-1.5 text-[11px]">
        <dt className="text-emerald-600 dark:text-emerald-400">Prihod</dt>
        <dd className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
          +{formatMoney(row.inflowCents, currency, 'bs-BA', { showCurrency: false })}
        </dd>
        <dt className="text-destructive">Trošak</dt>
        <dd className="text-right font-mono tabular-nums text-destructive">
          −{formatMoney(row.outflowCents, currency, 'bs-BA', { showCurrency: false })}
        </dd>
        <dt className="font-medium">Neto</dt>
        <dd className="text-right font-mono tabular-nums font-medium">
          {net >= 0n ? '+' : ''}
          {formatMoney(net, currency, 'bs-BA', { showCurrency: false })}
        </dd>
      </dl>
      {baselineFirst.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[11px]">
          {baselineFirst.slice(0, 5).map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className={cn('truncate', e.type === 'baseline' && 'text-muted-foreground')}>
                {e.description}
              </span>
              <span className="font-mono tabular-nums">
                {e.amountCents >= 0n ? '+' : ''}
                {formatMoney(e.amountCents, currency, 'bs-BA', { showCurrency: false })}
              </span>
            </li>
          ))}
          {baselineFirst.length > 5 && (
            <li className="text-muted-foreground">+{String(baselineFirst.length - 5)} više</li>
          )}
        </ul>
      )}
    </div>
  );
}

interface EventDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

/**
 * Recharts custom dot: render only when the day has a real (non-
 * baseline) event. Keeps the line clean for the 80–90% of days that
 * are baseline-only.
 */
function EventDot({ cx, cy, payload }: EventDotProps): React.ReactNode {
  if (cx === undefined || cy === undefined || !payload) return null;
  const hasEvent = payload.events.some((e) => e.type !== 'baseline');
  if (!hasEvent) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill="hsl(var(--background))"
      stroke="hsl(var(--primary))"
      strokeWidth={2}
    />
  );
}

export function ForecastChart({ days, currency, trendDown }: ForecastChartProps) {
  const rows = useMemo<ChartRow[]>(
    () =>
      days.map((d) => ({
        date: d.date,
        balance: centsToNumber(d.balanceCents),
        balanceLabel: formatMoney(d.balanceCents, currency, 'bs-BA', { showCurrency: true }),
        inflowCents: d.inflowCents,
        outflowCents: d.outflowCents,
        events: d.events,
      })),
    [days, currency],
  );

  // Pick a tick stride that gives ~6 X-axis labels regardless of window.
  const tickInterval = Math.max(1, Math.floor(rows.length / 6));
  // Line color hint: red on downward trend, emerald on flat/upward.
  const stroke = trendDown ? 'hsl(var(--destructive))' : '#10b981'; // emerald-500

  return (
    <div className="h-48 w-full sm:h-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval={tickInterval}
            tickFormatter={(v: string) => format(parseISO(v), 'd. MMM', { locale: bs })}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) =>
              (v / 100).toLocaleString('bs-BA', { maximumFractionDigits: 0 })
            }
          />
          <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Line
            type="monotone"
            dataKey="balance"
            stroke={stroke}
            strokeWidth={2}
            dot={EventDot as never}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
