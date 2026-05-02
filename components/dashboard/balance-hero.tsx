import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Money } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BalanceHeroProps {
  totalBalanceCents: bigint;
  totalLiabilitiesCents: bigint;
  /**
   * Out-of-scope debt — typically long-term loans the user has opted out of
   * net worth via `accounts.include_in_net_worth = false`. Surfaced as a
   * separate informational row so the user still sees the obligation
   * without crushing the headline net (audit follow-up 2026-05-02).
   */
  outOfScopeLiabilitiesCents: bigint;
  outOfScopeLiabilityCount: number;
  baseCurrency: string;
  netChangePercent: number;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

/**
 * Bosnian count + word for the out-of-scope-credits microcopy.
 * `1 → "1 kredit"`, anything else → `"X kredita"`. The form covers both
 * paucal (2–4) and genitive plural (5+) since they share the same word
 * in this declension. Real-world counts on a personal-finance app rarely
 * exceed three loans, so we don't go further into Slavic plural quirks.
 */
function pluralizeCredits(count: number): string {
  if (count === 1) return '1 kredit';
  return `${String(count)} kredita`;
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
  outOfScopeLiabilitiesCents,
  outOfScopeLiabilityCount,
  baseCurrency,
  netChangePercent,
}: BalanceHeroProps) {
  const hasLiabilities = totalLiabilitiesCents > 0n;
  const hasOutOfScope = outOfScopeLiabilitiesCents > 0n && outOfScopeLiabilityCount > 0;
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

      {/*
       * "Krediti (informativno)" — out-of-scope debt the user opted not to
       * count toward net worth (default for `loan` accounts). Renders below
       * the Aktiva/Pasiva rows, separated by a top border so the visual
       * hierarchy reads: Neto headline → in-scope breakdown → "by the way,
       * you also have these long-term loans". Muted-foreground tone keeps
       * it informational rather than alarming.
       */}
      {hasOutOfScope ? (
        <CardContent
          className={cn(
            'space-y-0.5 px-4 pb-3 pt-3 sm:px-6',
            hasLiabilities ? 'border-t' : 'border-t pt-3',
          )}
          data-testid="balance-hero-out-of-scope"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Krediti (informativno)</span>
            <Money
              cents={-outOfScopeLiabilitiesCents}
              currency={baseCurrency}
              tone="neutral"
              className="font-medium tabular-nums"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {pluralizeCredits(outOfScopeLiabilityCount)} — ne ulazi u Neto
          </p>
        </CardContent>
      ) : null}

      <CardContent
        className={cn(
          'px-4 pb-4 pt-2 sm:px-6 sm:pb-6',
          hasLiabilities || hasOutOfScope ? 'border-t' : 'pt-0',
        )}
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
