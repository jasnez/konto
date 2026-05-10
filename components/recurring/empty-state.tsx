'use client';

import { Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface RecurringEmptyStateProps {
  onScan: () => void;
  onAddManual?: () => void;
  busy?: boolean;
}

export function RecurringEmptyState({ onScan, onAddManual, busy }: RecurringEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <Repeat className="h-8 w-8" />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-lg font-semibold">Još nema pretplata</h2>
        <p className="text-sm text-muted-foreground">
          Skeniraj svoju istoriju transakcija — Konto pronalazi ponavljajuće troškove (Netflix,
          kirija, internet). Možeš i ručno dodati pretplatu koja još nije u istoriji.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button onClick={onScan} disabled={busy} size="lg">
          {busy ? 'Skeniranje…' : 'Pronađi pretplate'}
        </Button>
        {onAddManual && (
          <Button onClick={onAddManual} variant="outline" size="lg" disabled={busy}>
            <Plus className="mr-2 h-5 w-5" aria-hidden />
            Dodaj ručno
          </Button>
        )}
      </div>
    </Card>
  );
}
