'use client';

/**
 * Full-width card for the /uvidi list. The dashboard widget uses a slimmer
 * row layout in its own component; this card is for the dedicated page.
 */
import Link from 'next/link';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelativeBs } from '@/lib/format/format-relative-bs';
import { severityClasses } from '@/lib/insights/severity-palette';
import { typeLabel } from '@/lib/insights/type-labels';
import type { InsightRow } from '@/lib/queries/insights';
import { MarkdownBody } from './markdown-body';

export interface InsightCardProps {
  insight: InsightRow;
  /**
   * Active mode shows a dismiss (X) button; archived mode shows a "Vrati"
   * (restore) button. The /uvidi page passes the right one based on tab.
   */
  mode: 'active' | 'archived';
  onDismiss?: (id: string) => void;
  onRestore?: (id: string) => void;
}

export function InsightCard({ insight, mode, onDismiss, onRestore }: InsightCardProps) {
  const palette = severityClasses(insight.severity);

  return (
    <Card
      className={cn('flex flex-col gap-3 border-l-4 p-4', palette.border)}
      data-testid="insight-card"
      data-insight-id={insight.id}
      data-severity={insight.severity}
    >
      {/* Header: severity + type label + relative time */}
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn('inline-flex items-center rounded-full px-2 py-0.5 font-medium', palette.pill)}
        >
          {palette.label}
        </span>
        <span className="text-muted-foreground">{typeLabel(insight.type)}</span>
        <span className="text-muted-foreground/70" aria-hidden>
          ·
        </span>
        <time className="text-muted-foreground" dateTime={insight.createdAt}>
          {formatRelativeBs(insight.createdAt)}
        </time>

        <div className="ml-auto">
          {mode === 'active' ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Skloni uvid"
              onClick={() => {
                onDismiss?.(insight.id);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              aria-label="Vrati uvid"
              onClick={() => {
                onRestore?.(insight.id);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Vrati
            </Button>
          )}
        </div>
      </header>

      {/* Body: title + markdown */}
      <div>
        <h3 className="text-base font-semibold">{insight.title}</h3>
        <MarkdownBody className="whitespace-pre-line pt-1 text-sm text-muted-foreground">
          {insight.body}
        </MarkdownBody>
      </div>

      {/* Action link */}
      {insight.actionUrl && (
        <Link
          href={insight.actionUrl}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline"
        >
          Otvori
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </Card>
  );
}
