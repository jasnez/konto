/**
 * Shared ownership-verification helpers for server actions.
 *
 * Each helper SELECT-s a row by both its own `id` and `user_id` so ownership
 * is enforced at the query level rather than by a post-fetch manual check.
 * If the row doesn't exist or belongs to a different user the function returns
 * `{ ok: false, error: 'NOT_FOUND' }`.
 *
 * **SE-14 (2026-05-08):** Standardized on `NOT_FOUND` (was `FORBIDDEN`) so
 * we don't leak the "ID exists but isn't yours" signal vs. "ID doesn't
 * exist at all". `FORBIDDEN` is reserved for explicit business-rule
 * denials (e.g. "account is locked").
 *
 * These are SELECT-only helpers (no mutation), so they are NOT subject to the
 * local/no-unguarded-mutation ESLint rule.
 */

import { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface OwnedError {
  ok: false;
  error: 'NOT_FOUND' | 'DATABASE_ERROR';
}

/**
 * Verify the caller owns the given account and that it is not soft-deleted.
 * Returns the account's `currency` and `type` on success — `type` is needed
 * by the createTransaction action to enforce Pasiva-account rules (Phase C).
 */
export async function ensureOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
): Promise<{ ok: true; currency: string; type: string } | OwnedError> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id,currency,type')
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { ok: false, error: 'DATABASE_ERROR' };
  if (!account) return { ok: false, error: 'NOT_FOUND' };

  return { ok: true, currency: account.currency, type: account.type };
}

/**
 * Verify the caller owns the given category and that it is not soft-deleted.
 * Passes immediately if `categoryId` is null (uncategorised is always allowed).
 */
export async function ensureOwnedCategory(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string | null,
): Promise<{ ok: true } | OwnedError> {
  if (!categoryId) return { ok: true };

  const { data: category, error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { ok: false, error: 'DATABASE_ERROR' };
  if (!category) return { ok: false, error: 'NOT_FOUND' };

  return { ok: true };
}

/**
 * Verify the caller owns the given merchant and that it is not soft-deleted.
 * Passes immediately if `merchantId` is null.
 */
export async function ensureOwnedMerchant(
  supabase: SupabaseClient,
  userId: string,
  merchantId: string | null,
): Promise<{ ok: true } | OwnedError> {
  if (!merchantId) return { ok: true };

  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('id', merchantId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return { ok: false, error: 'DATABASE_ERROR' };
  if (!merchant) return { ok: false, error: 'NOT_FOUND' };

  return { ok: true };
}
