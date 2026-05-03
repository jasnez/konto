'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ArrowRight, Ban, MoreVertical, PencilLine, Pause } from 'lucide-react';
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
import type { ActiveRecurring } from '@/lib/queries/recurring';

const PERIOD_BADGE: Record<ActiveRecurring['period'], string> = {
  weekly: 'Sedmično',
  'bi-weekly': 'Dvosedmično',
  monthly: 'Mjesečno',
  quarterly: 'Kvartalno',
  yearly: 'Godišnje',
};

export interface RecurringCardProps {
  item: ActiveRecurring;
  onEdit: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
}

function formatHumanDate(iso: string | null): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'd. MMM yyyy.', { locale: bs });
}

export function RecurringCard({ item, onEdit, onPause, onCancel }: RecurringCardProps) {
  const isPaused = item.isPaused;
  const heroLabel = formatMoney(item.averageAmountCents, item.currency, 'bs-BA', {
    showCurrency: true,
  });

  return (
    <Card
      className={cn('flex flex-col gap-3 p-4 transition-opacity', isPaused && 'opacity-60')}
      data-testid="recurring-card"
      data-recurring-id={item.id}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">
            {item.merchantName ?? item.description}
          </h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {PERIOD_BADGE[item.period]}
          </span>
          {isPaused && (
            <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              Pauzirano do {formatHumanDate(item.pausedUntil)}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Meni za pretplatu"
              className="h-11 w-11 shrink-0"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                onEdit(item.id);
              }}
            >
              <PencilLine className="mr-2 h-4 w-4" aria-hidden />
              Uredi
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onPause(item.id);
              }}
            >
              <Pause className="mr-2 h-4 w-4" aria-hidden />
              Pauziraj
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onCancel(item.id);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" aria-hidden />
              Otkaži
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="font-mono text-2xl font-semibold tabular-nums">{heroLabel}</div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <dt className="text-[10px] uppercase tracking-wide">Sljedeća</dt>
          <dd className="mt-0.5 text-foreground">{formatHumanDate(item.nextExpectedDate)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide">Posljednja</dt>
          <dd className="mt-0.5 text-foreground">{formatHumanDate(item.lastSeenDate)}</dd>
        </div>
      </dl>

      <footer className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="truncate text-xs text-muted-foreground">
          {item.categoryName ?? 'Bez kategorije'}
        </span>
        <Link
          href={`/pretplate/${item.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Detalji
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </footer>
    </Card>
  );
}
