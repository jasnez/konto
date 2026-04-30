import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';
import { Money } from '@/components/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
          className="inline-flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Vidi sve
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
            <span className="text-3xl" aria-hidden>
              💸
            </span>
            <p className="text-sm text-muted-foreground">
              Još nema transakcija. Dodaj prvu da vidiš pregled ovdje.
            </p>
          </div>
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
                  <Money
                    cents={item.baseAmountCents}
                    currency={item.baseCurrency}
                    className="shrink-0 text-sm font-semibold"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
