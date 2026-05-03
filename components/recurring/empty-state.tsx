'use client';

import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface RecurringEmptyStateProps {
  onScan: () => void;
  busy?: boolean;
}

export function RecurringEmptyState({ onScan, busy }: RecurringEmptyStateProps) {
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
          Skeniraj svoju istoriju transakcija — Konto sam pronalazi ponavljajuće troškove (Netflix,
          kirija, internet).
        </p>
      </div>
      <Button onClick={onScan} disabled={busy} size="lg">
        {busy ? 'Skeniram…' : 'Pronađi pretplate'}
      </Button>
    </Card>
  );
}
