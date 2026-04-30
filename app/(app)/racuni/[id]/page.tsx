import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatMinorUnits } from '@/lib/format/amount';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountDetailHeader } from './account-detail-header';
import { CashReconcileButton } from './cash-reconcile-button';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Detalj računa + zadnjih 50 transakcija
 */
export default async function AccountDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/prijava');
  }

  const { data: acc, error: aErr } = await supabase
    .from('accounts')
    .select('id, name, icon, current_balance_cents, currency, institution, type')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr || !acc) {
    notFound();
  }

  const { data: txRows, error: txErr } = await supabase
    .from('transactions')
    .select(
      'id, transaction_date, description, original_amount_cents, original_currency, merchant_raw',
    )
    .eq('account_id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .limit(50);

  const list = txErr ? [] : txRows;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <AccountDetailHeader
        account={{
          id: acc.id,
          name: acc.name,
          icon: acc.icon,
          current_balance_cents: acc.current_balance_cents,
          currency: acc.currency,
        }}
      />

      {acc.institution ? <p className="text-sm text-muted-foreground">{acc.institution}</p> : null}

      {acc.type === 'cash' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/50 p-3">
          <p className="flex-1 text-sm text-muted-foreground">
            Ako ti se evidencija razlikuje od stvarne gotovine u novčaniku, možeš jednim potezom
            uskladiti — razlika ide u &quot;Gotovinski troškovi&quot;.
          </p>
          <CashReconcileButton
            accountId={acc.id}
            currency={acc.currency}
            currentBalanceCents={acc.current_balance_cents}
          />
        </div>
      ) : null}

      <section aria-labelledby="tx-heading" className="space-y-3">
        <h3 id="tx-heading" className="text-lg font-semibold">
          Transakcije
        </h3>
        {list.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Još nema transakcija</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Kad bude Faza 1 transakcija, ovdje će se pojaviti zadnje 50. Za sada možeš ručno
              unositi s ekrana Transakcije (uskoro) ili pripremi PDF.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2" aria-label="Zadnje transakcije">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded-xl border bg-card/50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium leading-tight">
                    {t.description ?? t.merchant_raw ?? 'Transakcija'}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.transaction_date}</p>
                </div>
                <p className="shrink-0 text-right text-base font-medium tabular-nums">
                  {formatMinorUnits(t.original_amount_cents, t.original_currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {txErr ? (
          <p className="text-sm text-destructive">Ne mogu učitati transakcije. Pokušaj kasnije.</p>
        ) : null}
      </section>
    </div>
  );
}
