'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/lib/format/format-money';

export interface ChartDataPoint {
  date: string; // YYYY-MM-DD
  amountCents: number; // absolute value
  currency: string;
}

export interface RecurringHistoryChartProps {
  data: ChartDataPoint[];
}

interface ChartRow {
  dateLabel: string;
  rawDate: string;
  amount: number;
  currency: string;
}

/**
 * Tiny tooltip that formats the cents-with-currency the same way the
 * rest of the app does, so the chart number doesn't drift from card
 * numbers.
 */
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}): React.ReactNode {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{row.dateLabel}</div>
      <div className="font-mono tabular-nums">
        {formatMoney(BigInt(row.amount), row.currency, 'bs-BA', { showCurrency: true })}
      </div>
    </div>
  );
}

export function RecurringHistoryChart({ data }: RecurringHistoryChartProps) {
  // Sort ASC for line chart and pre-format the date axis label.
  const rows = useMemo<ChartRow[]>(
    () =>
      [...data]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((d) => ({
          rawDate: d.date,
          dateLabel: format(parseISO(d.date), 'd. MMM yyyy.', { locale: bs }),
          amount: d.amountCents,
          currency: d.currency,
        })),
    [data],
  );

  return (
    <div className="h-48 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="rawDate"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: string) => format(parseISO(v), 'MMM yy', { locale: bs })}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: number) =>
              (v / 100).toLocaleString('bs-BA', { maximumFractionDigits: 0 })
            }
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: 'hsl(var(--primary))' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
