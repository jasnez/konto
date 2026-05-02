import { cn } from '@/lib/utils';

/**
 * Hand-rolled SVG sparkline. The premium account-card on /racuni renders
 * one of these per row (audit R7). We deliberately don't pull in a chart
 * library:
 *
 * - **Bundle weight.** Recharts is ~150KB gzipped, Chart.js ~70KB. The
 *   sparkline is ~60 lines of SVG and zero runtime cost.
 * - **Design control.** Default library outputs (axes, tooltips, legends)
 *   compete with the surrounding card chrome and have to be manually
 *   stripped. With raw SVG the visual matches the card exactly.
 * - **Performance.** No React-driven chart rerenders; the entire chart
 *   is one `<path d="...">` string baked at render time.
 *
 * If we ever need an interactive chart (full balance history page with
 * tooltips, axes, hover crosshair), pulling in Recharts at THAT route is
 * the right call — but the per-card sparkline shouldn't drag the entire
 * library cost into the /racuni bundle.
 */

export interface SparklinePoint {
  /** ISO YYYY-MM-DD. */
  day: string;
  /** End-of-day balance in the account's native currency. */
  balanceCents: bigint;
}

export type SparklineTone = 'positive' | 'negative' | 'neutral';

interface SparklineProps {
  points: SparklinePoint[];
  /** Logical viewBox width. The rendered SVG is `w-full` and stretches
   * horizontally, so this just sets the path scale; the absolute pixel
   * width is dictated by the container. */
  width?: number;
  /** Logical and rendered height in pixels. */
  height?: number;
  tone?: SparklineTone;
  className?: string;
  /** Localized description of the trend, read by screen readers. */
  ariaLabel?: string;
}

const TONE_CLASS: Record<SparklineTone, string> = {
  positive: 'text-income',
  negative: 'text-expense',
  neutral: 'text-muted-foreground',
};

export function Sparkline({
  points,
  width = 120,
  height = 28,
  tone = 'neutral',
  className,
  ariaLabel = 'Sparkline',
}: SparklineProps) {
  // Two points = minimum to draw a line. One point or empty = nothing
  // worth drawing; the parent should hide the slot entirely.
  if (points.length < 2) return null;

  const values = points.map((p) => Number(p.balanceCents));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // When all points are equal (no activity in window, or perfectly stable
  // balance), `range` would be 0 and the formula below would divide by zero.
  // We center the flat line vertically instead.
  const isFlat = max === min;
  const range = isFlat ? 1 : max - min;

  // Inset by 1px on top/bottom so the 1.5px stroke isn't clipped by the
  // viewport edges (stroke renders centered on the path).
  const yPadding = 1;
  const usableHeight = height - 2 * yPadding;
  const flatY = height / 2;

  const stepX = width / (points.length - 1);

  const linePoints = points.map((p, i) => {
    const x = i * stepX;
    const y = isFlat
      ? flatY
      : height - yPadding - ((Number(p.balanceCents) - min) / range) * usableHeight;
    return { x, y };
  });

  const linePath = linePoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
    .join(' ');

  // Area fill: same path, then close down to the bottom edges so the
  // region under the line is tinted. Uses `currentColor` + low opacity so
  // it picks up the same tone as the line and stays subtle. The
  // `points.length >= 2` guard at the top of the function ensures both
  // first and last points exist — so direct indexing is safe.
  const lastX = linePoints[linePoints.length - 1].x.toFixed(2);
  const firstX = linePoints[0].x.toFixed(2);
  const bottomY = height.toFixed(2);
  const areaPath = `${linePath} L${lastX},${bottomY} L${firstX},${bottomY} Z`;

  return (
    <svg
      // Render at full container width but fixed logical height. The
      // viewBox carries the chart geometry; `preserveAspectRatio="none"`
      // lets the line scale horizontally with the card while keeping
      // vertical proportions intact.
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={ariaLabel}
      className={cn(TONE_CLASS[tone], 'h-7 w-full', className)}
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.1} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        // Vector-effect keeps the stroke a constant 1.5px regardless of
        // the SVG's horizontal stretch from preserveAspectRatio="none".
        // Without this, very wide cards would render a hairline; very
        // narrow cards would render a chunky line.
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
