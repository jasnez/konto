import Link from 'next/link';
import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import { formatMinorUnits } from '@/lib/format/amount';
import type { BudgetTransactionRow } from '@/lib/queries/budgets';

interface Props {
  transactions: BudgetTransactionRow[];
  categoryName: string;
  budgetActive: boolean;
}

function formatTransactionDate(iso: string): string {
  return format(new Date(iso), 'd. MMM yyyy.', { locale: bs });
}

export function BudgetTransactionsList({ transactions, categoryName, budgetActive }: Props) {
  if (transactions.length === 0) {
    return (
      <section aria-labelledby="tx-heading" className="space-y-3">
        <h3 id="tx-heading" className="text-lg font-medium">
          Transakcije u ovom periodu
        </h3>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <span className="text-3xl" aria-hidden>
            📦
          </span>
          {budgetActive ? (
            <>
              <p className="text-base font-medium">Trenutno nema troškova iz ovog budžeta</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Kad dodaš transakcije u kategoriju &quot;{categoryName}&quot; u ovom periodu,
                pojaviće se ovdje.
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-medium">Budžet je deaktiviran</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Period se ne prati dok je budžet deaktiviran. Aktiviraj ga iz menija na kartici da
                ponovo pratiš potrošnju.
              </p>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="tx-heading" className="space-y-3">
      <h3 id="tx-heading" className="text-lg font-medium">
        Transakcije u ovom periodu
      </h3>
      <ul className="space-y-2" aria-label={`Transakcije za ${categoryName}`}>
        {transactions.map((t) => (
          <li key={t.id}>
            <Link
              href={`/transakcije/${t.id}`}
              className="flex flex-col gap-1 rounded-xl border bg-card/50 p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium leading-tight">
                  {t.description ?? t.merchantRaw ?? 'Transakcija'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTransactionDate(t.transactionDate)}
                </p>
              </div>
              <p className="shrink-0 text-right text-base font-medium tabular-nums">
                {formatMinorUnits(t.originalAmountCents, t.originalCurrency)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
