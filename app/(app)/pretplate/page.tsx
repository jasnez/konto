import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listActiveRecurring } from '@/lib/queries/recurring';
import { detectAndSuggestRecurring } from './actions';
import { PretplateClient, type SerializedActiveRecurring } from './pretplate-client';

export const metadata: Metadata = {
  title: 'Pretplate — Konto',
};

export default async function PretplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [active, suggestion] = await Promise.all([
    listActiveRecurring(supabase, user.id),
    detectAndSuggestRecurring(),
  ]);

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
      <PretplateClient initialActive={serialized} initialSuggestions={initialSuggestions} />
    </div>
  );
}
