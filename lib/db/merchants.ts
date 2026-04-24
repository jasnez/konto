import type { DbClient, MerchantInsert } from './types';

const LIST_COLS =
  'id, canonical_name, display_name, default_category_id, icon, color, transaction_count' as const;

/**
 * Returns all live merchants for a user. Used by the merchants list page and
 * the /uvoz import flow (which needs the full set to de-duplicate imported
 * merchant names against existing entries).
 */
export async function listActiveMerchants(supabase: DbClient, userId: string) {
  return supabase
    .from('merchants')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('display_name', { ascending: true });
}

/**
 * Finds a live merchant by id, scoped to the user.
 */
export async function findActiveMerchant(supabase: DbClient, userId: string, merchantId: string) {
  return supabase
    .from('merchants')
    .select(`${LIST_COLS}, deleted_at`)
    .eq('id', merchantId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Finds a live merchant by canonical name, scoped to the user. Used by /uvoz
 * to avoid creating duplicate merchants when the same payee appears on multiple
 * imported rows.
 */
export async function findMerchantByCanonical(
  supabase: DbClient,
  userId: string,
  canonicalName: string,
) {
  return supabase
    .from('merchants')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .eq('canonical_name', canonicalName)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Inserts a new merchant and returns its id. On duplicate canonical_name,
 * Postgres returns error code 23505 — callers should handle that and fall
 * back to findMerchantByCanonical. Used by the quick-add on-blur flow and
 * /uvoz.
 */
export async function insertMerchant(supabase: DbClient, values: MerchantInsert) {
  return supabase.from('merchants').insert(values).select('id').single();
}

/**
 * Soft-deletes a merchant. Caller must confirm transaction_count === 0 if the
 * UI enforces that guard (the count column is maintained by trigger 00018).
 */
export async function softDeleteMerchant(supabase: DbClient, userId: string, merchantId: string) {
  return supabase
    .from('merchants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', merchantId)
    .eq('user_id', userId);
}
