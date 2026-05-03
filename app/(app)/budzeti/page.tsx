import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listBudgetsWithSpent } from '@/lib/queries/budgets';
import { logSafe } from '@/lib/logger';
import { BudgetsClient } from './budgets-client';

export const metadata: Metadata = {
  title: 'Budžeti — Konto',
};

export default async function BudgetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [budgets, categoriesRes, profileRes] = await Promise.all([
    listBudgetsWithSpent(supabase, user.id),
    supabase
      .from('categories')
      .select('id, name, icon, kind')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('kind', ['expense', 'saving'])
      .order('sort_order', { ascending: true }),
    supabase.from('profiles').select('base_currency').eq('id', user.id).maybeSingle(),
  ]);

  if (categoriesRes.error) {
    logSafe('budgets_page_categories_error', {
      userId: user.id,
      error: categoriesRes.error.message,
    });
  }

  const categories = (categoriesRes.data ?? [])
    .filter(
      (c): c is typeof c & { kind: 'expense' | 'saving' } =>
        c.kind === 'expense' || c.kind === 'saving',
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      kind: c.kind,
    }));

  const baseCurrency = profileRes.data?.base_currency ?? 'BAM';

  // Serialize bigints + date for the Client boundary.
  const serialized = budgets.map((b) => ({
    id: b.id,
    amountCents: b.amountCents.toString(),
    spentCents: b.spentCents.toString(),
    currency: b.currency,
    period: b.period,
    active: b.active,
    rollover: b.rollover,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    progress: b.progress,
    daysLeft: b.daysLeft,
    category: b.category,
  }));

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <BudgetsClient
        initialBudgets={serialized}
        categories={categories}
        baseCurrency={baseCurrency}
      />
    </div>
  );
}
