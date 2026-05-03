'use client';

import { PiggyBank } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface BudgetsEmptyStateProps {
  onCreate: () => void;
  hasCategories: boolean;
}

export function BudgetsEmptyState({ onCreate, hasCategories }: BudgetsEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <PiggyBank className="h-8 w-8" />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-lg font-semibold">Postavi prvi budžet</h2>
        <p className="text-sm text-muted-foreground">
          {hasCategories
            ? 'Pratiti potrošnju po kategoriji. Vidi se kad si blizu limita.'
            : 'Prvo kreiraj kategoriju troška ili štednje, pa onda dodaj budžet za nju.'}
        </p>
      </div>
      <Button onClick={onCreate} disabled={!hasCategories} size="lg">
        Postavi budžet
      </Button>
    </Card>
  );
}
