/**
 * Dashboard widget for /pocetna — shows the top 3 active insights, sorted
 * severity-first then created_at-DESC.
 *
 * Server Component: receives a pre-resolved Promise so the parent can
 * dispatch the query in parallel with other widgets (mirror of
 * BudgetsWidget pattern).
 *
 * Each row is fully composed server-side; only the dismiss button is a
 * client island (`<InsightsWidgetDismiss>`) so we can run useTransition
 * + optimistic UI without making the whole widget client.
 */
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { severityClasses } from '@/lib/insights/severity-palette';
import { typeLabel } from '@/lib/insights/type-labels';
import { formatRelativeBs } from '@/lib/format/format-relative-bs';
import type { InsightRow } from '@/lib/queries/insights';
import { InsightsWidgetList } from './insights-widget-client';

export interface InsightsWidgetProps {
  /** Already top-3 active. Parent fetches via `listInsights({ mode: 'active', limit: 3 })`. */
  insightsPromise: Promise<InsightRow[]>;
}

export async function InsightsWidget({ insightsPromise }: InsightsWidgetProps) {
  const items = await insightsPromise;

  return (
    <Card data-testid="insights-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <CardTitle className="text-lg">Uvidi</CardTitle>
        <Link
          href="/uvidi"
          className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Svi uvidi
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {items.length === 0 ? <InsightsWidgetEmptyState /> : <InsightsWidgetList items={items} />}
      </CardContent>
    </Card>
  );
}

function InsightsWidgetEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <CheckCircle2 className="h-7 w-7 text-emerald-500" aria-hidden />
      <p className="max-w-sm text-sm text-muted-foreground">
        Nema novih uvida. Sve je u redu.
      </p>
    </div>
  );
}

/**
 * Read-only row used both inside this widget and (potentially) elsewhere.
 * Keeps the layout server-rendered for fast first paint; the dismiss
 * button is a client island next to it.
 */
export interface InsightsWidgetRowProps {
  insight: InsightRow;
  /** Optional client-side action button (e.g., dismiss). Server-only when omitted. */
  trailing?: React.ReactNode;
}

export function InsightsWidgetRow({ insight, trailing }: InsightsWidgetRowProps) {
  const palette = severityClasses(insight.severity);
  return (
    <li className="flex items-start gap-3" data-testid="insight-row" data-insight-id={insight.id}>
      <span className={cn('mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full', palette.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <Link href="/uvidi" className="block hover:underline">
          <h3 className="truncate text-sm font-medium">{insight.title}</h3>
        </Link>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {/* Strip markdown markers for the widget preview to avoid raw ** showing. */}
          {stripMarkdown(insight.body)}
        </p>
        <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px] text-muted-foreground/80">
          <span>{typeLabel(insight.type)}</span>
          <span aria-hidden>·</span>
          <time dateTime={insight.createdAt}>{formatRelativeBs(insight.createdAt)}</time>
        </div>
      </div>
      {trailing}
    </li>
  );
}

/** Removes `**...**` markup for the widget preview. The full `/uvidi` card uses MarkdownBody. */
function stripMarkdown(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1');
}
