import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listActiveRecurring } from '@/lib/queries/recurring';
import { listActiveAccounts } from '@/lib/db/accounts';
import { detectAndSuggestRecurring } from './actions';
import {
  PretplateClient,
  type SerializedActiveRecurring,
  type AccountOption,
  type CategoryOption,
} from './pretplate-client';

export const metadata: Metadata = {
  title: 'Pretplate — Konto',
};

// Pasiva (debt) accounts can't legitimately receive a recurring outflow —
// money flowing into a credit card / loan is a transfer (debt payment),
// not a subscription. Mirrors the disable rule in quick-add-transaction.
const SPENDING_ACCOUNT_TYPES = new Set([
  'checking',
  'savings',
  'cash',
  'revolut',
  'wise',
  'investment',
  'other',
]);

export default async function PretplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [active, suggestion, accountsRes, categoriesRes] = await Promise.all([
    listActiveRecurring(supabase, user.id),
    detectAndSuggestRecurring(),
    listActiveAccounts(supabase, user.id),
    supabase
      .from('categories')
      .select('id, name, kind')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('kind', ['expense', 'saving'])
      .order('sort_order', { ascending: true }),
  ]);

  const accounts: AccountOption[] = (accountsRes.data ?? [])
    .filter((a) => SPENDING_ACCOUNT_TYPES.has(a.type))
    .map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      type: a.type,
    }));

  const categories: CategoryOption[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  // Serialize bigints across the RSC boundary.
  const serialized: SerializedActiveRecurring[] = active.map((a) => ({
    id: a.id,
    description: a.description,
    period: a.period,
    averageAmountCents: a.averageAmountCents.toString(),
    currency: a.currency,
    nextExpectedDate: a.nextExpectedDate,
    lastSeenDate: a.lastSeenDate,
    pausedUntil: a.pausedUntil,
    isPaused: a.isPaused,
    detectionConfidence: a.detectionConfidence,
    occurrences: a.occurrences,
    merchantId: a.merchantId,
    categoryId: a.categoryId,
    accountId: a.accountId,
    merchantName: a.merchantName,
    categoryName: a.categoryName,
    accountName: a.accountName,
    createdAt: a.createdAt,
  }));

  const initialSuggestions = suggestion.success ? suggestion.data.candidates : [];

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <PretplateClient
        initialActive={serialized}
        initialSuggestions={initialSuggestions}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
