import type { DbClient } from './types';

/** Columns needed for display lists and the quick-add account picker. */
const LIST_COLS =
  'id, name, type, currency, current_balance_cents, is_active, include_in_net_worth, sort_order, icon, color' as const;

/** All non-sensitive columns — used by the account detail and edit pages. */
const DETAIL_COLS =
  `${LIST_COLS}, institution, institution_slug, account_number_last4, initial_balance_cents, deleted_at, created_at, updated_at` as const;

/**
 * Returns all live (non-deleted) accounts for a user, ordered by sort position
 * then name. Used by the accounts list page and the quick-add picker.
 */
export async function listActiveAccounts(supabase: DbClient, userId: string) {
  return supabase
    .from('accounts')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
}

/**
 * Returns a single live account owned by the user, or null if not found /
 * soft-deleted / belongs to another user. Used by edit, delete, and detail
 * pages where ownership must be verified before acting.
 */
export async function findActiveAccount(supabase: DbClient, userId: string, accountId: string) {
  return supabase
    .from('accounts')
    .select(DETAIL_COLS)
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Finds any account by id + userId regardless of soft-delete status. Used by
 * restore flows where the caller needs to see deleted rows.
 */
export async function findAccount(supabase: DbClient, userId: string, accountId: string) {
  return supabase
    .from('accounts')
    .select(DETAIL_COLS)
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
}

/** Soft-deletes an account. Caller must verify ownership first. */
export async function softDeleteAccount(supabase: DbClient, userId: string, accountId: string) {
  return supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId);
}

/** Restores a soft-deleted account. Idempotent — safe to call on live rows. */
export async function restoreAccount(supabase: DbClient, userId: string, accountId: string) {
  return supabase
    .from('accounts')
    .update({ deleted_at: null })
    .eq('id', accountId)
    .eq('user_id', userId);
}

/**
 * Returns the current_balance_cents and currency for all accounts that
 * contribute to net worth. Used by the net-worth calculation fallback and
 * the /budzet overview.
 */
export async function listNetWorthAccounts(supabase: DbClient, userId: string) {
  return supabase
    .from('accounts')
    .select('id, currency, current_balance_cents, include_in_net_worth')
    .eq('user_id', userId)
    .eq('include_in_net_worth', true)
    .is('deleted_at', null);
}
