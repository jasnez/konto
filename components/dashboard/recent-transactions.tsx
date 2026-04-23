import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';

export interface RecentTransactionItem {
  id: string;
  transactionDate: string;
  baseAmountCents: bigint;
  baseCurrency: string;
  merchantLabel: string;
  categoryLabel: string;
}

interface RecentTransactionsProps {
  items: RecentTransactionItem[];
}

function formatTransactionDate(value: string): string {
  return format(parseISO(value), 'd. MMM.', { locale: bs });
}

export function RecentTransactions({ items }: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 p-4 sm:p-6">
        <CardTitle className="text-lg">Zadnje transakcije</CardTitle>
        <Link
          href="/transakcije"
          className="inline-flex h-11 min-h-[44px] items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Vidi sve
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Još nema transakcija. Dodaj prvu da vidiš pregled ovdje.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/transakcije/${item.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.merchantLabel}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.categoryLabel} · {formatTransactionDate(item.transactionDate)}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      item.baseAmountCents > 0n && 'text-green-600 dark:text-green-400',
                      item.baseAmountCents < 0n && 'text-red-600 dark:text-red-400',
                      item.baseAmountCents === 0n && 'text-muted-foreground',
                    )}
                  >
                    {formatMoney(item.baseAmountCents, item.baseCurrency, 'bs-BA')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
