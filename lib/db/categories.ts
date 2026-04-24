import type { DbClient } from './types';

const LIST_COLS = 'id, name, slug, kind, icon, color, parent_id, is_system, sort_order' as const;

/**
 * Returns all live categories for a user, ordered by sort position then name.
 * Used by the categories page, quick-add picker, and the /uvoz import flow
 * (which needs to resolve category names from imported data).
 */
export async function listActiveCategories(supabase: DbClient, userId: string) {
  return supabase
    .from('categories')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
}

/**
 * Finds a live category by id, scoped to the user. Used by edit/delete guards
 * and when creating transactions that reference a category.
 */
export async function findActiveCategory(supabase: DbClient, userId: string, categoryId: string) {
  return supabase
    .from('categories')
    .select(LIST_COLS)
    .eq('id', categoryId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Finds a live category by its slug, scoped to the user. Used by /uvoz when
 * matching imported rows to existing categories by slug instead of name (slugs
 * are stable even when display names are localised).
 */
export async function findCategoryBySlug(supabase: DbClient, userId: string, slug: string) {
  return supabase
    .from('categories')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Finds a live category by id regardless of soft-delete status. Used by the
 * restore flow.
 */
export async function findCategory(supabase: DbClient, userId: string, categoryId: string) {
  return supabase
    .from('categories')
    .select(`${LIST_COLS}, deleted_at`)
    .eq('id', categoryId)
    .eq('user_id', userId)
    .maybeSingle();
}

/** Soft-deletes a category. Caller must verify it's not a system category first. */
export async function softDeleteCategory(supabase: DbClient, userId: string, categoryId: string) {
  return supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', categoryId)
    .eq('user_id', userId);
}

/** Restores a soft-deleted category. Idempotent. */
export async function restoreCategory(supabase: DbClient, userId: string, categoryId: string) {
  return supabase
    .from('categories')
    .update({ deleted_at: null })
    .eq('id', categoryId)
    .eq('user_id', userId);
}
