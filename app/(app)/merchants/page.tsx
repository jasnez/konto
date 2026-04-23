import { createClient } from '@/lib/supabase/server';
import { MerchantsClient } from './merchants-client';
import type { MerchantListItem } from './types';

export default async function MerchantsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const [{ data: merchantRows, error: mErr }, { data: catRows, error: cErr }] = await Promise.all([
    supabase
      .from('merchants')
      .select(
        'id, canonical_name, display_name, default_category_id, icon, color, transaction_count',
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('canonical_name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
  ]);

  if (mErr || cErr) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-destructive">Ne mogu učitati prodavače. Pokušaj osvježiti stranicu.</p>
      </div>
    );
  }

  const catMap = new Map(catRows.map((c) => [c.id, c.name]));

  const merchants: MerchantListItem[] = merchantRows.map((m) => ({
    id: m.id,
    canonical_name: m.canonical_name,
    display_name: m.display_name,
    default_category_id: m.default_category_id,
    category_name: m.default_category_id ? (catMap.get(m.default_category_id) ?? null) : null,
    icon: m.icon,
    color: m.color,
    transaction_count: m.transaction_count,
  }));

  const categoryOptions = catRows.map((c) => ({ id: c.id, name: c.name }));

  return <MerchantsClient merchants={merchants} categoryOptions={categoryOptions} />;
}
