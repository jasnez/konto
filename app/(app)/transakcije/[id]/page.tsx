import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TransactionDetailClient } from './transaction-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/prijava');
  }

  const [
    { data: tx, error: txError },
    { data: categories, error: categoriesError },
    { data: accounts, error: accountsError },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'id,transaction_date,original_amount_cents,original_currency,base_amount_cents,base_currency,fx_rate,fx_rate_date,merchant_raw,description,notes,source,is_transfer,tags,receipt_scan_id,created_at,updated_at,accounts(id,name,currency),categories(id,name,icon)',
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('categories')
      .select('id,name,icon')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    // Pulled for the "Označi kao transfer" dialog so the user can pick a
    // counterparty account in-place. Filtered down to same-currency
    // candidates client-side once we know the source tx's currency.
    supabase
      .from('accounts')
      .select('id,name,currency')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  if (txError || !tx || categoriesError || accountsError) {
    notFound();
  }

  const txView = {
    id: tx.id,
    transaction_date: tx.transaction_date,
    original_amount_cents: tx.original_amount_cents,
    original_currency: tx.original_currency,
    base_amount_cents: tx.base_amount_cents,
    base_currency: tx.base_currency,
    fx_rate: tx.fx_rate,
    fx_rate_date: tx.fx_rate_date,
    merchant_raw: tx.merchant_raw,
    description: tx.description,
    notes: tx.notes,
    source: tx.source,
    is_transfer: tx.is_transfer,
    tags: tx.tags,
    receipt_scan_id: tx.receipt_scan_id,
    created_at: tx.created_at,
    updated_at: tx.updated_at,
    account: { id: tx.accounts.id, name: tx.accounts.name, currency: tx.accounts.currency },
    category: tx.categories
      ? { id: tx.categories.id, name: tx.categories.name, icon: tx.categories.icon }
      : null,
  };

  return <TransactionDetailClient tx={txView} categories={categories} accounts={accounts} />;
}
