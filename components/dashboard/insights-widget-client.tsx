'use client';

/**
 * Client island for the insights widget. Owns the optimistic dismiss state
 * + reuses the shared `useInsightDismiss` hook (toast + Server Action +
 * undo). Renders rows via the server component `InsightsWidgetRow`.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInsightDismiss } from '@/hooks/use-insight-dismiss';
import type { InsightRow } from '@/lib/queries/insights';
import { InsightsWidgetRow } from './insights-widget';

export interface InsightsWidgetListProps {
  items: InsightRow[];
}

export function InsightsWidgetList({ items }: InsightsWidgetListProps) {
  const [visible, setVisible] = useState<InsightRow[]>(items);

  const { handleDismiss, pending } = useInsightDismiss({
    onOptimisticRemove: (id) => {
      setVisible((prev) => prev.filter((x) => x.id !== id));
    },
    onRollback: () => {
      // Server will revalidatePath('/pocetna'), which re-fetches and resets
      // initialItems via the Server Component re-render. We don't restore
      // locally because the next paint comes from the server.
      setVisible(items);
    },
    onUndismissConfirmed: () => {
      // Likewise: revalidatePath refreshes the list. No local insertion.
      setVisible(items);
    },
  });

  if (visible.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Nema više uvida za prikaz.
      </p>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Top 3 uvidi">
      {visible.map((insight) => (
        <InsightsWidgetRow
          key={insight.id}
          insight={insight}
          trailing={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Skloni uvid"
              disabled={pending}
              onClick={() => {
                handleDismiss(insight.id);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          }
        />
      ))}
    </ul>
  );
}
