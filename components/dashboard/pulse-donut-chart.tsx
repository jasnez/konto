'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Line, LineChart, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatMoney } from '@/lib/format/format-money';
import { Money } from '@/components/money';
import { cn } from '@/lib/utils';

/**
 * Wire-compatible serialised shape (bigint → string across the RSC
 * boundary). The widget Server Component stringifies; this component
 * deserialises with `BigInt(...)`.
 */
export interface SerializedCategorySpend {
  /** NULL = "Nerazvrstano" bucket. */
  categoryId: string | null;
  name: string;
  icon: string;
  color: string | null;
  slug: string;
  amountCents: string;
  prevAmountCents: string;
  /** Length 12, oldest → newest. */
  monthlyHistory: string[];
}

export interface PulseDonutChartProps {
  data: SerializedCategorySpend[];
  currency: string;
  /** Total cents over the displayed period (used in the centre label). */
  totalCents: string;
  variant: 'widget' | 'page';
  /**
   * Date range of the displayed period. Required for `page` variant —
   * each list row links to /transakcije pre-filtered to the category +
   * range. Omitted on widget (no drill-down on dashboard).
   */
  drillDownDateRange?: { from: string; to: string };
}

/** Fallback palette for categories without a `color` set. Picked to be
 *  distinguishable on white *and* dark backgrounds. */
export const FALLBACK_PALETTE = [
  '#10b981',
  '#0ea5e9',
  '#f59e0b',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
  '#6366f1',
  '#fb923c',
  '#84cc16',
  '#ec4899',
] as const;

const SPARKLINE_MONTHS = 3;

interface DeserialisedRow {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  slug: string;
  amountCents: bigint;
  prevAmountCents: bigint;
  monthlyHistory: bigint[];
}

/** Cents → JS number for chart use (Recharts wants finite numbers).
 *  Realistic spending is far below MAX_SAFE_INTEGER; clamp defensively. */
function centsToNumber(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (b < -BigInt(Number.MAX_SAFE_INTEGER)) return -Number.MAX_SAFE_INTEGER;
  return Number(b);
}

export function pickColor(item: SerializedCategorySpend, idx: number): string {
  if (item.color != null && item.color.length > 0) return item.color;
  return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

export interface TrendInfo {
  /** 'up' = porast (loše za ekspenzu, prikazujemo crveno), 'down' = pad,
   *  'new' = prethodno 0 a sad postoji, 'flat' = bez promjene */
  kind: 'up' | 'down' | 'new' | 'flat';
  percent: number; // 0..100, rounded
}

export function computeTrend(current: bigint, prev: bigint): TrendInfo {
  if (prev === 0n && current === 0n) return { kind: 'flat', percent: 0 };
  if (prev === 0n && current > 0n) return { kind: 'new', percent: 0 };
  if (prev === current) return { kind: 'flat', percent: 0 };
  const diff = current - prev;
  // Compute |diff/prev| * 100 in bigint to avoid float on the way in.
  const sign = diff > 0n ? 1 : -1;
  const absDiff = diff > 0n ? diff : -diff;
  const absPrev = prev > 0n ? prev : -prev;
  const pct = Number((absDiff * 100n) / absPrev);
  return { kind: sign > 0 ? 'up' : 'down', percent: Math.min(pct, 999) };
}

interface SummaryProps {
  hovered: DeserialisedRow | null;
  selected: DeserialisedRow | null;
  totalCents: bigint;
  totalForPercent: bigint;
  currency: string;
}

/** Centre-of-donut label: hovered/selected category, falling back to the
 *  total. Hover wins over selection so desktop users get instant
 *  feedback while keeping the click "pinned" state. */
function CentreSummary({ hovered, selected, totalCents, totalForPercent, currency }: SummaryProps) {
  const active = hovered ?? selected;
  if (active) {
    const pctNum =
      totalForPercent > 0n
        ? Math.min(99.9, Number((active.amountCents * 1000n) / totalForPercent) / 10)
        : 0;
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span aria-hidden className="text-xl">
          {active.icon}
        </span>
        <span className="max-w-[6.5rem] truncate text-xs font-medium">{active.name}</span>
        <span className="font-mono text-sm font-semibold tabular-nums sm:text-base">
          {formatMoney(active.amountCents, currency, 'bs-BA', { showCurrency: false })}
        </span>
        <span className="text-[10px] text-muted-foreground">{pctNum.toFixed(1)}% od ukupno</span>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      <span className="font-mono text-base font-semibold tabular-nums sm:text-lg">
        {formatMoney(totalCents, currency, 'bs-BA', { showCurrency: true })}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ukupno</span>
    </div>
  );
}

interface SparklineProps {
  history: bigint[];
  color: string;
}

/** Tiny sparkline rendered without axes — last N months only. Pure visual
 *  hint, never the source of truth. */
function Sparkline({ history, color }: SparklineProps) {
  const points = useMemo(
    () => history.slice(-SPARKLINE_MONTHS).map((cents, i) => ({ i, v: centsToNumber(cents) })),
    [history],
  );
  // All-zero history → flat line. Recharts renders nothing for that case;
  // render a static muted bar so the cell isn't visually empty.
  const allZero = points.every((p) => p.v === 0);
  if (allZero) {
    return <div aria-hidden className="h-2 w-full rounded-full bg-muted-foreground/15" />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface TrendBadgeProps {
  trend: TrendInfo;
}

function TrendBadge({ trend }: TrendBadgeProps) {
  if (trend.kind === 'new') {
    return (
      <span className="inline-flex items-center rounded-sm bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
        novo
      </span>
    );
  }
  if (trend.kind === 'flat') {
    return null;
  }
  // 'up' = increase in spending = bad → red; 'down' = decrease → green
  const isUp = trend.kind === 'up';
  const Icon = isUp ? ArrowUp : ArrowDown;
  const aria = isUp
    ? `poraslo za ${String(trend.percent)} posto`
    : `smanjeno za ${String(trend.percent)} posto`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        isUp ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400',
      )}
      aria-label={aria}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {isUp ? '+' : '−'}
      {trend.percent}%
    </span>
  );
}

interface RowProps {
  row: DeserialisedRow;
  totalForPercent: bigint;
  currency: string;
  drillDownDateRange?: { from: string; to: string };
  isActive: boolean;
  onHover: (row: DeserialisedRow | null) => void;
  onClick: (row: DeserialisedRow) => void;
}

function CategoryRow({
  row,
  totalForPercent,
  currency,
  drillDownDateRange,
  isActive,
  onHover,
  onClick,
}: RowProps) {
  const trend = useMemo(
    () => computeTrend(row.amountCents, row.prevAmountCents),
    [row.amountCents, row.prevAmountCents],
  );
  const pctOfTotal =
    totalForPercent > 0n ? Number((row.amountCents * 1000n) / totalForPercent) / 10 : 0;

  const inner = (
    <>
      <span aria-hidden className="text-base sm:text-lg">
        {row.icon}
      </span>
      <span className="flex-1 truncate text-sm font-medium">{row.name}</span>
      <div aria-hidden className="hidden h-5 w-12 sm:block">
        <Sparkline history={row.monthlyHistory} color={row.color} />
      </div>
      <span className="shrink-0 text-right font-mono text-sm tabular-nums">
        <Money cents={row.amountCents} currency={currency} tone="default" />
      </span>
      <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {pctOfTotal.toFixed(1)}%
      </span>
      <span className="shrink-0">
        <TrendBadge trend={trend} />
      </span>
    </>
  );

  const baseClass = cn(
    'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
    'transition-colors duration-fast ease-out',
    isActive ? 'bg-muted/60' : 'hover:bg-muted/40',
  );

  // Drill-down only on `page` variant *and* when categoryId exists.
  // Uncategorised bucket has no drill-down (transakcije filter doesn't
  // accept "no category" today). Keep as a button so click toggles
  // selected state without navigating.
  if (drillDownDateRange != null && row.categoryId != null) {
    const href = `/transakcije?category=${row.categoryId}&from=${drillDownDateRange.from}&to=${drillDownDateRange.to}`;
    return (
      <Link
        href={href}
        className={baseClass}
        onMouseEnter={() => {
          onHover(row);
        }}
        onMouseLeave={() => {
          onHover(null);
        }}
        onFocus={() => {
          onHover(row);
        }}
        onBlur={() => {
          onHover(null);
        }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={baseClass}
      onClick={() => {
        onClick(row);
      }}
      onMouseEnter={() => {
        onHover(row);
      }}
      onMouseLeave={() => {
        onHover(null);
      }}
      onFocus={() => {
        onHover(row);
      }}
      onBlur={() => {
        onHover(null);
      }}
      aria-pressed={isActive}
    >
      {inner}
    </button>
  );
}

export function PulseDonutChart({
  data,
  currency,
  totalCents,
  variant,
  drillDownDateRange,
}: PulseDonutChartProps) {
  const headingId = useId();

  const rows = useMemo<DeserialisedRow[]>(
    () =>
      data.map((d, i) => ({
        categoryId: d.categoryId,
        name: d.name,
        icon: d.icon,
        color: pickColor(d, i),
        slug: d.slug,
        amountCents: BigInt(d.amountCents),
        prevAmountCents: BigInt(d.prevAmountCents),
        monthlyHistory: d.monthlyHistory.map((c) => BigInt(c)),
      })),
    [data],
  );

  const totalCentsBig = useMemo(() => BigInt(totalCents), [totalCents]);
  const sumForPercent = useMemo(() => {
    let s = 0n;
    for (const r of rows) s += r.amountCents;
    return s;
  }, [rows]);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Recharts 3.x: per-slice styling via `fill`/`stroke` fields on the data
  // entry itself. Avoids the deprecated `<Cell>` child API while keeping
  // active-slice highlight on click.
  const pieData = useMemo(
    () =>
      rows.map((r, i) => ({
        name: r.name,
        value: centsToNumber(r.amountCents),
        fill: r.color,
        stroke: selectedIdx === i ? 'hsl(var(--foreground))' : 'hsl(var(--background))',
        strokeWidth: selectedIdx === i ? 2 : 1,
      })),
    [rows, selectedIdx],
  );

  const donutHeight = variant === 'widget' ? 180 : 240;
  const innerR = variant === 'widget' ? 56 : 72;
  const outerR = variant === 'widget' ? 80 : 100;

  // Accessible summary: top 3 categories by amount (already sorted desc).
  const ariaLabel = useMemo(() => {
    const top = rows.slice(0, 3);
    if (top.length === 0) return 'Pregled potrošnje po kategorijama';
    const parts = top.map(
      (r) => `${r.name} ${formatMoney(r.amountCents, currency, 'bs-BA', { showCurrency: true })}`,
    );
    return `Potrošnja po kategorijama: ${parts.join(', ')}`;
  }, [rows, currency]);

  return (
    <div className="space-y-3">
      <div className="relative mx-auto" style={{ height: donutHeight, maxWidth: 320 }}>
        <div role="img" aria-labelledby={headingId} className="h-full w-full">
          <span id={headingId} className="sr-only">
            {ariaLabel}
          </span>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={innerR}
                outerRadius={outerR}
                paddingAngle={2}
                cursor="pointer"
                onMouseEnter={(_, i) => {
                  setHoveredIdx(i);
                }}
                onMouseLeave={() => {
                  setHoveredIdx(null);
                }}
                onClick={(_, i) => {
                  setSelectedIdx((prev) => (prev === i ? null : i));
                }}
                isAnimationActive
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <CentreSummary
          hovered={hoveredIdx == null ? null : (rows[hoveredIdx] ?? null)}
          selected={selectedIdx == null ? null : (rows[selectedIdx] ?? null)}
          totalCents={totalCentsBig}
          totalForPercent={sumForPercent}
          currency={currency}
        />
      </div>

      <ul className="space-y-1" data-testid="pulse-donut-list">
        {rows.map((r, i) => (
          <li key={r.slug + String(i)}>
            <CategoryRow
              row={r}
              totalForPercent={sumForPercent}
              currency={currency}
              drillDownDateRange={drillDownDateRange}
              isActive={selectedIdx === i}
              onHover={(row) => {
                setHoveredIdx(row == null ? null : i);
              }}
              onClick={(row) => {
                setSelectedIdx((prev) => (prev === i ? null : i));
                // Keep behaviour symmetric with donut click: hovered cleared on
                // click so the centre updates immediately to the pinned row.
                setHoveredIdx(null);
                void row;
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
