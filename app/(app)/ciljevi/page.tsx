import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listGoals } from '@/lib/queries/goals';
import { logSafe } from '@/lib/logger';
import { GoalsClient, type SerializedGoal } from './goals-client';

export const metadata: Metadata = {
  title: 'Ciljevi štednje — Konto',
};

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [goals, accountsRes, profileRes] = await Promise.all([
    listGoals(supabase, user.id),
    supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase.from('profiles').select('base_currency').eq('id', user.id).maybeSingle(),
  ]);

  if (accountsRes.error) {
    logSafe('goals_page_accounts_error', {
      userId: user.id,
      error: accountsRes.error.message,
    });
  }

  const accounts = (accountsRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));

  const baseCurrency = profileRes.data?.base_currency ?? 'BAM';

  // Serialize bigints + dates for the Client boundary.
  const serialized: SerializedGoal[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    targetAmountCents: g.targetAmountCents.toString(),
    currentAmountCents: g.currentAmountCents.toString(),
    currency: g.currency,
    targetDate: g.targetDate,
    accountId: g.accountId,
    icon: g.icon,
    color: g.color,
    active: g.active,
    achievedAt: g.achievedAt,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    progress: g.progress,
    accountName: g.accountName,
    recommendedMonthlyCents:
      g.recommendedMonthlyCents !== null ? g.recommendedMonthlyCents.toString() : null,
    monthsLeft: g.monthsLeft,
  }));

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <GoalsClient
        initialGoals={serialized}
        accounts={accounts}
        baseCurrency={baseCurrency}
      />
    </div>
  );
}
