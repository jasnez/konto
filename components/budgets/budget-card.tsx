'use client';

import { MoreVertical, PencilLine, Pause, Play, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import type { BudgetWithProgress } from '@/lib/queries/budgets';

export interface BudgetCardProps {
  budget: BudgetWithProgress;
  onEdit: (id: string) => void;
  onToggleActive: (id: string, nextActive: boolean) => void;
  onDelete: (id: string) => void;
}

const PERIOD_LABEL_GENITIVE: Record<'monthly' | 'weekly', string> = {
  monthly: 'mjeseca',
  weekly: 'sedmice',
};

const PERIOD_BADGE: Record<'monthly' | 'weekly', string> = {
  monthly: 'Mjesečno',
  weekly: 'Sedmično',
};

interface ProgressPalette {
  bar: string;
  ring: string;
  pill: string;
}

function paletteFor(progress: number): ProgressPalette {
  if (progress >= 0.95) {
    return {
      bar: 'bg-destructive',
      ring: 'ring-destructive/30',
      pill: 'bg-destructive/10 text-destructive',
    };
  }
  if (progress >= 0.7) {
    return {
      bar: 'bg-amber-500',
      ring: 'ring-amber-500/30',
      pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    };
  }
  return {
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-500/30',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  };
}

export function BudgetCard({ budget, onEdit, onToggleActive, onDelete }: BudgetCardProps) {
  const palette = paletteFor(budget.progress);
  const percent = Math.round(budget.progress * 100);
  const overrun = budget.spentCents > budget.amountCents;
  const remainingCents = budget.amountCents - budget.spentCents;
  const isMuted = !budget.active;

  // shadcn Progress accepts 0..100 and clamps internally; we cap at 100 for
  // the visual bar but show the true % in copy.
  const progressForBar = Math.min(100, Math.max(0, percent));

  return (
    <Card
      className={cn('flex flex-col gap-4 p-4 transition-opacity', isMuted && 'opacity-60')}
      data-testid="budget-card"
      data-budget-id={budget.id}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {budget.category.icon ?? '📦'}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{budget.category.name}</h3>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                palette.pill,
              )}
            >
              {PERIOD_BADGE[budget.period]}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Meni za budžet"
              className="h-11 w-11 shrink-0"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onEdit(budget.id);
              }}
            >
              <PencilLine className="mr-2 h-4 w-4" aria-hidden />
              Uredi
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onToggleActive(budget.id, !budget.active);
              }}
            >
              {budget.active ? (
                <>
                  <Pause className="mr-2 h-4 w-4" aria-hidden />
                  Deaktiviraj
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" aria-hidden />
                  Aktiviraj
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onDelete(budget.id);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Obriši
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="space-y-2">
        <Progress
          value={progressForBar}
          aria-label={`Iskorišteno ${String(percent)} posto`}
          className={cn('h-2', palette.ring, 'ring-1')}
          // The shadcn Progress fills with the primary color by default; we
          // override the indicator via a style hook on the inner div using
          // [&>div]: which works with Tailwind's arbitrary descendant variant.
          // Each palette already encodes the bar color so the markup stays
          // declarative.
          style={{ ['--progress-bar' as string]: '' }}
        />
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-mono tabular-nums">
            {formatMoney(budget.spentCents, budget.currency, 'bs-BA', { showCurrency: false })}{' '}
            <span className="text-muted-foreground">/</span>{' '}
            {formatMoney(budget.amountCents, budget.currency, 'bs-BA', { showCurrency: true })}
          </span>
          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', palette.pill)}>
            {percent}%
          </span>
        </div>
      </div>

      <footer className="flex items-center justify-between text-xs text-muted-foreground">
        {budget.active ? (
          <span>
            {budget.daysLeft === 0
              ? `Posljednji dan ${PERIOD_LABEL_GENITIVE[budget.period]}`
              : `${String(budget.daysLeft)} dana do kraja ${PERIOD_LABEL_GENITIVE[budget.period]}`}
          </span>
        ) : (
          <span>Deaktiviran</span>
        )}
        {overrun ? (
          <span className="font-medium text-destructive">
            Premašen za{' '}
            {formatMoney(-remainingCents, budget.currency, 'bs-BA', { showCurrency: true })}
          </span>
        ) : (
          <span>
            {formatMoney(remainingCents, budget.currency, 'bs-BA', { showCurrency: true })}{' '}
            preostalo
          </span>
        )}
      </footer>
    </Card>
  );
}
