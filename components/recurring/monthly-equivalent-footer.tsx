'use client';

import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/format-money';
import { totalMonthlyEquivalentCents, type ActiveRecurring } from '@/lib/queries/recurring';

export interface MonthlyEquivalentFooterProps {
  items: ActiveRecurring[];
}

interface CurrencyTotal {
  currency: string;
  totalCents: bigint;
  activeCount: number;
}

/**
 * Group rows by currency, then sum monthly equivalents per currency.
 * Multi-currency portfolios get one line per currency — we don't try
 * to FX-convert because the conversion would be a server-side concern
 * (the dashboard summary already does that elsewhere).
 *
 * Paused rows are excluded from the total so the number reflects what
 * the user is currently being charged. Active count in the label
 * mirrors the same filter so the math reads consistently.
 */
function groupByCurrency(items: readonly ActiveRecurring[]): CurrencyTotal[] {
  const buckets = new Map<string, ActiveRecurring[]>();
  for (const it of items) {
    const bucket = buckets.get(it.currency);
    if (bucket) {
      bucket.push(it);
    } else {
      buckets.set(it.currency, [it]);
    }
  }
  const out: CurrencyTotal[] = [];
  for (const [currency, group] of buckets) {
    const totalCents = totalMonthlyEquivalentCents(group, { skipPaused: true });
    const activeCount = group.filter((g) => !g.isPaused).length;
    out.push({ currency, totalCents, activeCount });
  }
  // Sort by absolute total DESC so the dominant currency surfaces first.
  return out.sort((a, b) =>
    Number(
      (b.totalCents < 0n ? -b.totalCents : b.totalCents) -
        (a.totalCents < 0n ? -a.totalCents : a.totalCents),
    ),
  );
}

export function MonthlyEquivalentFooter({ items }: MonthlyEquivalentFooterProps) {
  const totals = groupByCurrency(items);
  if (totals.length === 0) return null;

  return (
    <Card className="bg-muted/40">
      <CardContent className="flex flex-col gap-2 p-4 sm:p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Info className="h-3.5 w-3.5" aria-hidden />
          <span>Mjesečni ekvivalent svih aktivnih pretplata</span>
        </div>
        <ul className="space-y-1">
          {totals.map((t) => (
            <li
              key={t.currency}
              className="flex items-baseline justify-between gap-3 font-mono tabular-nums"
            >
              <span className="text-sm text-muted-foreground">
                {String(t.activeCount)} {t.activeCount === 1 ? 'pretplata' : 'pretplata'}
              </span>
              <span className="text-lg font-semibold">
                {formatMoney(t.totalCents, t.currency, 'bs-BA', { showCurrency: true })}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Pauzirane pretplate i različite valute prikazuju se odvojeno.
        </p>
      </CardContent>
    </Card>
  );
}
