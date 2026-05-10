'use client';

import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface GoalsEmptyStateProps {
  onCreate: () => void;
}

export function GoalsEmptyState({ onCreate }: GoalsEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <Target className="h-8 w-8" />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-lg font-semibold">Postavi prvi cilj štednje.</h2>
        <p className="text-sm text-muted-foreground">
          Ljetovanje, novi telefon, hitna rezerva — postavi iznos i rok.
        </p>
      </div>
      <Button onClick={onCreate} size="lg">
        Postavi novi cilj
      </Button>
    </Card>
  );
}
