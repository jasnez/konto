import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';
import { ReceiptScanClient } from './receipt-scan-client';

function isCategoryKind(value: string): value is CategoryOption['kind'] {
  return (
    value === 'expense' ||
    value === 'income' ||
    value === 'transfer' ||
    value === 'saving' ||
    value === 'investment'
  );
}

export const metadata: Metadata = {
  title: 'Skeniraj račun — Konto',
};

// Serverless function timeout for this route. Server Actions dispatched from
// this page (uploadReceipt, analyzeReceipt) inherit it. Gemini has its own
// 25 s hard timeout inside `extractReceiptFields`; 60 s is a safety net for
// storage upload/download on top of that.
export const maxDuration = 60;

export default async function SkenirajPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/prijava');

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id,name,currency,type')
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

  const accountOptions: AccountOption[] = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  const categoryOptions: CategoryOption[] = [];
  for (const c of categories ?? []) {
    if (!isCategoryKind(c.kind)) continue;
    categoryOptions.push({ id: c.id, name: c.name, icon: c.icon, kind: c.kind });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Skeniraj račun</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uslikaj ili učitaj sliku fiskalnog računa — AI će automatski pročitati iznos, datum i
          prodavca pa samo potvrdi.
        </p>
      </div>
      <ReceiptScanClient accounts={accountOptions} categories={categoryOptions} />
    </div>
  );
}
