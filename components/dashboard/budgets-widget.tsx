import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format/format-money';
import type { BudgetWithProgress } from '@/lib/queries/budgets';

/**
 * Dashboard widget for /pocetna — shows the top 3 active budgets sorted
 * by % utilisation DESC so the most-pressing one is on top.
 *
 * Server Component: receives a pre-resolved `Promise<BudgetWithProgress[]>`
 * so the parent can dispatch the listBudgetsWithSpent fetch in parallel
 * with the other dashboard sections (mirror of summaryPromise pattern in
 * pocetna/page.tsx).
 */

export interface BudgetsWidgetProps {
  budgetsPromise: Promise<BudgetWithProgress[]>;
}

interface ProgressPalette {
  bar: string;
  ring: string;
  text: string;
}

/**
 * Three-stage palette (mirror of components/budgets/budget-card.tsx).
 *
 * Local copy is intentional — pulling this into a shared module would be
 * premature abstraction (one duplicate, 12 LoC). If a third call site
 * appears, refactor to lib/budgets/palette.ts.
 */
function paletteFor(progress: number): ProgressPalette {
  if (progress >= 0.95) {
    return {
      bar: '[&>*]:bg-destructive',
      ring: 'ring-destructive/30',
      text: 'text-destructive',
    };
  }
  if (progress >= 0.7) {
    return {
      bar: '[&>*]:bg-amber-500',
      ring: 'ring-amber-500/30',
      text: 'text-amber-700 dark:text-amber-400',
    };
  }
  return {
    bar: '[&>*]:bg-emerald-500',
    ring: 'ring-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-400',
  };
}

export async function BudgetsWidget({ budgetsPromise }: BudgetsWidgetProps) {
  const all = await budgetsPromise;
  const active = all.filter((b) => b.active);
  // Sort by progress DESC so the closest-to-limit budget surfaces first
  // (the one the user most likely needs to act on). Ties broken by
  // amount DESC so a 50% of 1000 KM beats 50% of 50 KM.
  active.sort((a, b) => {
    if (a.progress !== b.progress) return b.progress - a.progress;
    return Number(b.amountCents - a.amountCents);
  });
  const top = active.slice(0, 3);

  return (
    <Card data-testid="budgets-widget">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <CardTitle className="text-lg">Budžeti</CardTitle>
        <Link
          href="/budzeti"
          className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Svi budžeti
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {top.length === 0 ? <BudgetsWidgetEmptyState /> : <BudgetsWidgetList items={top} />}
      </CardContent>
    </Card>
  );
}

function BudgetsWidgetEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <span aria-hidden className="text-3xl">
        💰
      </span>
      <p className="text-sm text-muted-foreground">
        Postavi prvi budžet da vidiš ovdje koliko si potrošio od limita.
      </p>
      <Link
        href="/budzeti"
        className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
      >
        Postavi budžet
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function BudgetsWidgetList({ items }: { items: BudgetWithProgress[] }) {
  return (
    <ul className="space-y-3" aria-label="Top 3 budžeti">
      {items.map((b) => (
        <BudgetsWidgetRow key={b.id} budget={b} />
      ))}
    </ul>
  );
}

function BudgetsWidgetRow({ budget }: { budget: BudgetWithProgress }) {
  const palette = paletteFor(budget.progress);
  const percent = Math.round(budget.progress * 100);
  const overrun = budget.spentCents > budget.amountCents;
  const progressForBar = Math.min(100, Math.max(0, percent));

  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-base" aria-hidden>
            {budget.category.icon ?? '📦'}
          </span>
          <span className="truncate text-sm font-medium">{budget.category.name}</span>
        </div>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', palette.text)}>
          {percent}%
        </span>
      </div>
      <Progress
        value={progressForBar}
        aria-label={`Iskorišteno ${String(percent)} posto`}
        className={cn('h-1.5 ring-1', palette.ring, palette.bar)}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatMoney(budget.spentCents, budget.currency, 'bs-BA', { showCurrency: false })} /{' '}
          {formatMoney(budget.amountCents, budget.currency, 'bs-BA', { showCurrency: true })}
        </span>
        {overrun ? (
          <span className={cn('font-medium', palette.text)}>Premašen</span>
        ) : (
          <span>{String(budget.daysLeft)} dana</span>
        )}
      </div>
    </li>
  );
}
