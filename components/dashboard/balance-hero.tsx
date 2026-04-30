import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Money } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BalanceHeroProps {
  totalBalanceCents: bigint;
  totalLiabilitiesCents: bigint;
  baseCurrency: string;
  netChangePercent: number;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function BalanceHero({
  totalBalanceCents,
  totalLiabilitiesCents,
  baseCurrency,
  netChangePercent,
}: BalanceHeroProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4 sm:p-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Stanje (uključeni računi)</p>
          <CardTitle className="text-2xl font-medium tracking-tight sm:text-3xl">
            <Money cents={totalBalanceCents} currency={baseCurrency} tone="default" />
          </CardTitle>
          {totalLiabilitiesCents > 0n ? (
            <div className="pt-2">
              <p className="text-sm text-muted-foreground">Zaduženja (krediti i kartice)</p>
              <p className="text-lg font-medium tabular-nums tracking-tight sm:text-xl">
                <Money cents={totalLiabilitiesCents} currency={baseCurrency} tone="expense" />
              </p>
            </div>
          ) : null}
        </div>
        <Link
          href="/racuni"
          className="inline-flex h-11 min-h-[44px] items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Svi računi
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              'font-medium',
              netChangePercent > 0 && 'text-green-700 dark:text-green-300',
              netChangePercent < 0 && 'text-red-700 dark:text-red-300',
            )}
          >
            {formatPercent(netChangePercent)}
          </Badge>
          <span className="text-sm text-muted-foreground">u odnosu na prošli mjesec</span>
        </div>
      </CardContent>
    </Card>
  );
}
