import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransactionEditForm } from '@/app/(app)/transakcije/[id]/uredi/transaction-edit-form';
import { TransactionEditModalShell } from './transaction-edit-modal-shell';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption, TransactionKind } from '@/components/category-select';

interface PageProps {
  params: Promise<{ id: string }>;
}

function isCategoryKind(value: string): value is CategoryOption['kind'] {
  return (
    value === 'expense' ||
    value === 'income' ||
    value === 'transfer' ||
    value === 'saving' ||
    value === 'investment'
  );
}

function inferKind(input: {
  is_transfer: boolean;
  original_amount_cents: number;
}): TransactionKind {
  if (input.is_transfer) return 'transfer';
  return input.original_amount_cents >= 0 ? 'income' : 'expense';
}

/**
 * Intercepted version of /transakcije/[id]/uredi rendered into the
 * (app)/@modal slot. Soft navigation from anywhere in the app — typically
 * the "Uredi" button on /transakcije/[id] — lands here; direct URL hits
 * (refresh, external link) fall through to the regular full-page route
 * because @modal/default.tsx returns null on a hard load.
 *
 * Data fetching deliberately mirrors the full-page route so the modal and
 * the standalone page can never disagree on what they render. If you
 * change the SELECT shape there, change it here too. We could share via
 * a helper but keeping the two server components parallel makes it
 * obvious that they're meant to render the same thing.
 *
 * Audit item N17.
 */
export default async function TransactionEditModalPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const [{ data: tx, error: txError }, { data: accounts }, { data: categories }] =
    await Promise.all([
      supabase
        .from('transactions')
        .select(
          'id,account_id,original_amount_cents,original_currency,transaction_date,merchant_raw,category_id,notes,is_transfer',
        )
        .eq('id', id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('accounts')
        .select('id,name,currency')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('categories')
        .select('id,name,icon,kind')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);

  if (txError || !tx) {
    notFound();
  }

  const accountOptions: AccountOption[] = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
  }));

  const categoryOptions: CategoryOption[] = [];
  (categories ?? []).forEach((category) => {
    if (!isCategoryKind(category.kind)) {
      return;
    }
    categoryOptions.push({
      id: category.id,
      name: category.name,
      icon: category.icon,
      kind: category.kind,
    });
  });

  const initialKind = inferKind(tx);

  return (
    <TransactionEditModalShell>
      <TransactionEditForm
        transactionId={tx.id}
        initialKind={initialKind}
        initialValues={{
          account_id: tx.account_id,
          amount_cents: BigInt(tx.original_amount_cents),
          currency: tx.original_currency,
          transaction_date: tx.transaction_date,
          merchant_raw: tx.merchant_raw,
          merchant_id: null,
          category_id: tx.category_id,
          notes: tx.notes,
        }}
        accounts={accountOptions}
        categories={categoryOptions}
        chromeless
      />
    </TransactionEditModalShell>
  );
}
