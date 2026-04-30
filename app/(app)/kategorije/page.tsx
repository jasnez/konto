import { createClient } from '@/lib/supabase/server';
import { CategoriesClient } from './categories-client';
import type { CategoryListItem } from './types';

export default async function KategorijePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: raw, error } = await supabase
    .from('categories')
    .select('id, name, slug, icon, color, kind, is_system, parent_id, sort_order')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <p className="text-destructive">Ne mogu učitati kategorije. Pokušaj osvježiti stranicu.</p>
      </div>
    );
  }

  const categories = raw as CategoryListItem[];

  return <CategoriesClient categories={categories} />;
}
