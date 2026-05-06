import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';
import type { BudgetWithProgress } from '@/lib/queries/budgets';

interface Props {
  budget: BudgetWithProgress;
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

// Mirrors the palette in components/budgets/budget-card.tsx so the detail
// page reads as the "zoomed-in" version of the card. Extracted to a shared
// module would be cleaner, but is deferred to keep this PR scoped.
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

export function BudgetDetailHeader({ budget }: Props) {
  const palette = paletteFor(budget.progress);
  const percent = Math.round(budget.progress * 100);
  const overrun = budget.spentCents > budget.amountCents;
  const remainingCents = budget.amountCents - budget.spentCents;
  const progressForBar = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-4">
      <Button
        asChild
        variant="ghost"
        className="-ml-2 h-11 touch-manipulation px-2 text-muted-foreground"
      >
        <Link href="/budzeti" className="inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Budžeti
        </Link>
      </Button>

      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-2xl"
          aria-hidden
        >
          {budget.category.icon ?? '📦'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{budget.category.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                palette.pill,
              )}
            >
              {PERIOD_BADGE[budget.period]}
            </span>
            {!budget.active ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Deaktiviran
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Progress
          value={progressForBar}
          aria-label={`Iskorišteno ${String(percent)} posto`}
          className={cn('h-2', palette.ring, 'ring-1')}
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

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {budget.active ? (
          <span>
            {budget.daysLeft === 0
              ? `Posljednji dan ${PERIOD_LABEL_GENITIVE[budget.period]}`
              : `${String(budget.daysLeft)} dana do kraja ${PERIOD_LABEL_GENITIVE[budget.period]}`}
          </span>
        ) : (
          <span>Period se ne prati dok je deaktiviran</span>
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
      </div>
    </div>
  );
}
