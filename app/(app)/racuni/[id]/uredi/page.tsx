import { notFound, redirect } from 'next/navigation';
import { CURRENCIES, type CurrencyCode } from '@/lib/accounts/constants';
import type { AccountFormEditValues } from '@/lib/accounts/validation';
import { createClient } from '@/lib/supabase/server';
import { AccountForm } from '@/components/accounts/account-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ista polja kao „novi”, prepopulirana (DS §4.3 D)
 */
export default async function UrediRacunPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/prijava');
  }

  const { data: acc, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !acc) {
    notFound();
  }

  const currency: AccountFormEditValues['currency'] = CURRENCIES.includes(
    acc.currency as CurrencyCode,
  )
    ? acc.currency
    : 'BAM';

  const defaults: AccountFormEditValues = {
    name: acc.name,
    type: acc.type as AccountFormEditValues['type'],
    institution: acc.institution,
    currency,
    icon: acc.icon,
    color: acc.color,
    include_in_net_worth: acc.include_in_net_worth,
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">Uredi račun</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Promjene se spremaju odmah nakon pritiska.
      </p>
      <AccountForm
        mode="edit"
        accountId={acc.id}
        readOnlyInitialCents={acc.initial_balance_cents}
        defaultValues={defaults}
      />
    </div>
  );
}
