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

/**
 * Dashboard hero card. Shows the user's true net position (Aktiva − Pasiva)
 * as the primary number, with the assets and liabilities breakdown as
 * supporting detail rows.
 *
 * Why net worth and not the assets balance? With a loan account, assets
 * alone (314 KM) understates the picture — the user is actually in the
 * red across their household. Showing the honest net is the premium
 * default; users who want the "spendable today" view can hit Računi.
 */
export function BalanceHero({
  totalBalanceCents,
  totalLiabilitiesCents,
  baseCurrency,
  netChangePercent,
}: BalanceHeroProps) {
  const hasLiabilities = totalLiabilitiesCents > 0n;
  const netWorthCents = totalBalanceCents - totalLiabilitiesCents;
  const netToneClass =
    netWorthCents > 0n ? 'text-income' : netWorthCents < 0n ? 'text-expense' : 'text-foreground';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 p-4 sm:p-6">
        <div className="space-y-1">
          <p className="text-caption text-muted-foreground">
            {hasLiabilities ? 'Neto stanje' : 'Stanje'}
          </p>
          <CardTitle
            className={cn('text-display tabular-nums', netToneClass)}
            data-testid="balance-hero-net-amount"
          >
            <Money cents={netWorthCents} currency={baseCurrency} tone="default" />
          </CardTitle>
        </div>
        <Link
          href="/racuni"
          className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Svi računi
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>

      {hasLiabilities ? (
        <CardContent className="space-y-1.5 px-4 pb-3 pt-0 sm:px-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Aktiva</span>
            <Money
              cents={totalBalanceCents}
              currency={baseCurrency}
              tone="default"
              className="font-medium tabular-nums"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pasiva</span>
            <Money
              cents={-totalLiabilitiesCents}
              currency={baseCurrency}
              tone="expense"
              className="font-medium tabular-nums"
            />
          </div>
        </CardContent>
      ) : null}

      <CardContent
        className={cn('px-4 pb-4 pt-2 sm:px-6 sm:pb-6', hasLiabilities ? 'border-t' : 'pt-0')}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              'font-medium',
              netChangePercent > 0 && 'text-income',
              netChangePercent < 0 && 'text-expense',
            )}
          >
            {formatPercent(netChangePercent)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {hasLiabilities ? 'Neto' : 'Stanje'}: vs prošli mjesec
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
