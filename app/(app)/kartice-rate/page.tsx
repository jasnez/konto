import { revalidatePath } from 'next/cache';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { KarticeRateClient, type OccurrenceRow, type PlanRow } from './kartice-rate-client';
import { logSafe } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'Kartice na rate — Konto',
};

async function fetchPlans(userId: string): Promise<PlanRow[]> {
  const supabase = await createClient();

  // Fetch plans.
  const { data: plans, error } = await supabase
    .from('installment_plans')
    .select(
      'id,currency,total_cents,installment_count,installment_cents,start_date,day_of_month,notes,status,account_id,merchant_id,category_id',
    )
    .eq('user_id', userId)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false });

  if (error) {
    logSafe('fetch_installment_plans_error', { userId, error: error.message });
    return [];
  }
  if (plans.length === 0) return [];

  const planIds = plans.map((p) => p.id);
  const accountIds = [...new Set(plans.map((p) => p.account_id))];
  const merchantIds = [
    ...new Set(plans.map((p) => p.merchant_id).filter((id): id is string => id !== null)),
  ];
  const categoryIds = [
    ...new Set(plans.map((p) => p.category_id).filter((id): id is string => id !== null)),
  ];

  const [accountsRes, merchantsRes, categoriesRes, occsRes] = await Promise.all([
    supabase.from('accounts').select('id,name').in('id', accountIds),
    merchantIds.length > 0
      ? supabase.from('merchants').select('id,display_name').in('id', merchantIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    categoryIds.length > 0
      ? supabase.from('categories').select('id,name').in('id', categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from('installment_occurrences')
      .select('id,plan_id,occurrence_num,due_date,amount_cents,state,transaction_id')
      .in('plan_id', planIds)
      .order('occurrence_num', { ascending: true }),
  ]);

  const accountMap = new Map((accountsRes.data ?? []).map((a) => [a.id, a.name]));
  const merchantMap = new Map((merchantsRes.data ?? []).map((m) => [m.id, m.display_name]));
  const categoryMap = new Map((categoriesRes.data ?? []).map((c) => [c.id, c.name]));
  const occMap = new Map<string, OccurrenceRow[]>();
  for (const o of occsRes.data ?? []) {
    const list = occMap.get(o.plan_id) ?? [];
    list.push({
      id: o.id,
      occurrence_num: o.occurrence_num,
      due_date: o.due_date,
      amount_cents: o.amount_cents,
      state: o.state as OccurrenceRow['state'],
      transaction_id: o.transaction_id ?? null,
    });
    occMap.set(o.plan_id, list);
  }

  return plans.map(
    (p): PlanRow => ({
      id: p.id,
      account_name: accountMap.get(p.account_id) ?? 'Račun',
      merchant_name: p.merchant_id ? (merchantMap.get(p.merchant_id) ?? null) : null,
      category_name: p.category_id ? (categoryMap.get(p.category_id) ?? null) : null,
      currency: p.currency,
      total_cents: p.total_cents,
      installment_count: p.installment_count,
      installment_cents: p.installment_cents,
      start_date: p.start_date,
      day_of_month: p.day_of_month,
      notes: p.notes,
      status: p.status as PlanRow['status'],
      occurrences: occMap.get(p.id) ?? [],
    }),
  );
}

export default async function KarticeRatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const plans = await fetchPlans(user.id);

  async function refresh() {
    'use server';
    await Promise.resolve();
    revalidatePath('/kartice-rate');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-headline">Kartice na rate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pregled aktivnih planova otplate. Nova rata se automatski bilježi svaki dan.
        </p>
      </div>
      <KarticeRateClient plans={plans} onRefresh={refresh} />
    </div>
  );
}
