'use client';

import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { Check, X } from 'lucide-react';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { SuggestedCandidate } from '@/app/(app)/pretplate/actions';

const PERIOD_LABEL: Record<SuggestedCandidate['period'], string> = {
  weekly: 'sedmično',
  'bi-weekly': 'dvosedmično',
  monthly: 'mjesečno',
  quarterly: 'kvartalno',
  yearly: 'godišnje',
};

export interface SuggestedCardProps {
  candidate: SuggestedCandidate;
  onConfirm: (candidate: SuggestedCandidate) => void;
  onIgnore: (candidate: SuggestedCandidate) => void;
  busy?: boolean;
}

function confidenceTier(c: number): { label: string; pillClass: string } {
  if (c >= 0.7) {
    return {
      label: 'Visoko',
      pillClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    };
  }
  return {
    label: 'Srednje',
    pillClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  };
}

export function SuggestedCard({ candidate, onConfirm, onIgnore, busy }: SuggestedCardProps) {
  const { label: tierLabel, pillClass } = confidenceTier(candidate.confidence);
  const amount = formatMoney(BigInt(candidate.averageAmountCents), candidate.currency, 'bs-BA', {
    showCurrency: true,
  });
  const lastSeen = format(parseISO(candidate.lastSeen), 'd. MMM yyyy.', { locale: bs });

  return (
    <Card
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="suggested-card"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-base font-semibold">{candidate.description}</h3>
          <span
            className={cn(
              'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              pillClass,
            )}
          >
            {tierLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{amount}</span>{' '}
          {PERIOD_LABEL[candidate.period]} · {candidate.occurrences}× · zadnji put {lastSeen}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onIgnore(candidate);
          }}
          disabled={busy}
          aria-label={`Ignoriši ${candidate.description}`}
          className="h-11"
        >
          <X className="mr-1 h-4 w-4" aria-hidden />
          Ignoriši
        </Button>
        <Button
          size="sm"
          onClick={() => {
            onConfirm(candidate);
          }}
          disabled={busy}
          className="h-11"
        >
          <Check className="mr-1 h-4 w-4" aria-hidden />
          Potvrdi
        </Button>
      </div>
    </Card>
  );
}
