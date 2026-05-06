import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBudgetById, listBudgetTransactionsForCurrentPeriod } from '@/lib/queries/budgets';
import { BudgetDetailHeader } from './budget-detail-header';
import { BudgetTransactionsList } from './budget-transactions-list';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { title: 'Budžet — Konto' };

  const budget = await getBudgetById(supabase, user.id, id);
  if (!budget) return { title: 'Budžet — Konto' };

  return { title: `${budget.category.name} — Budžet — Konto` };
}

export default async function BudgetDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const budget = await getBudgetById(supabase, user.id, id);
  if (!budget) notFound();

  const transactions = await listBudgetTransactionsForCurrentPeriod(supabase, user.id, {
    categoryId: budget.category.id,
    period: budget.period,
    active: budget.active,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <BudgetDetailHeader budget={budget} />
      <BudgetTransactionsList
        transactions={transactions}
        categoryName={budget.category.name}
        budgetActive={budget.active}
      />
    </div>
  );
}
