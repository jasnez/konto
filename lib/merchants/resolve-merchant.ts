import { findMerchantByCanonical, insertMerchant } from '@/lib/db/merchants';
import type { DbClient } from '@/lib/db/types';
import { logSafe, logWarn } from '@/lib/logger';
import { normalizeMerchantName } from './normalize';

const FUZZY_AUTO_LINK_THRESHOLD = 0.55;

export interface ResolveMerchantResult {
  merchantId: string | null;
  created: boolean;
}

/**
 * Resolves an OCR-extracted (or user-typed) merchant name to a `merchant_id`
 * for the receipt-scan flow.
 *
 * Strategy (in order):
 *  1. Skip if input is null/empty or normalizes to empty.
 *  2. Exact canonical match.
 *  3. Fuzzy match via `search_merchants` RPC; auto-link only when
 *     similarity_score >= FUZZY_AUTO_LINK_THRESHOLD (0.55).
 *  4. Create a new merchant. On 23505 (unique violation) refetch by canonical;
 *     if even that misses, the row is soft-deleted and we leave merchantId null
 *     (transaction still saves with merchant_raw populated).
 *
 * Never throws — receipt save must not fail because of merchant resolution.
 */
export async function resolveMerchantForReceipt(
  supabase: DbClient,
  userId: string,
  rawName: string | null,
): Promise<ResolveMerchantResult> {
  if (!rawName) return { merchantId: null, created: false };

  const trimmed = rawName.trim();
  const canonical = normalizeMerchantName(trimmed);
  if (!canonical) return { merchantId: null, created: false };

  // 1) Exact canonical match.
  try {
    const { data: existing, error } = await findMerchantByCanonical(supabase, userId, canonical);
    if (error) {
      logWarn('merchant_resolve_exact_lookup_error', {
        userId,
        message: error.message,
      });
    } else if (existing?.id) {
      return { merchantId: existing.id, created: false };
    }
  } catch (err) {
    logWarn('merchant_resolve_exact_lookup_threw', {
      userId,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }

  // 2) Fuzzy match via search_merchants RPC. The RPC has a substring fallback
  // that returns rows even when similarity is near-zero, so we MUST gate on
  // the explicit threshold rather than trusting the top result blindly.
  try {
    const { data: rows, error } = await supabase.rpc('search_merchants', {
      p_query: canonical,
      p_limit: 1,
    });
    if (error) {
      logWarn('merchant_resolve_fuzzy_error', { userId, message: error.message });
    } else if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as { id: unknown; similarity_score: unknown } | undefined;
      const id = typeof row?.id === 'string' ? row.id : null;
      const score = typeof row?.similarity_score === 'number' ? row.similarity_score : null;
      if (id !== null && score !== null && score >= FUZZY_AUTO_LINK_THRESHOLD) {
        return { merchantId: id, created: false };
      }
    }
  } catch (err) {
    logWarn('merchant_resolve_fuzzy_threw', {
      userId,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }

  // 3) Insert new merchant. display_name = trimmed user input (preserves case
  // and visible suffix); canonical_name = normalized form for dedup.
  try {
    const { data: inserted, error } = await insertMerchant(supabase, {
      user_id: userId,
      canonical_name: canonical,
      display_name: trimmed.slice(0, 120),
    });

    if (!error) {
      return { merchantId: inserted.id, created: true };
    }

    // 23505 = unique_violation. Two paths produce this:
    //  a) race: another concurrent save just inserted the same canonical.
    //  b) soft-deleted merchant exists with same canonical (the unique index
    //     is NOT partial — it covers deleted_at IS NOT NULL rows too).
    if (error.code === '23505') {
      const refetch = await findMerchantByCanonical(supabase, userId, canonical);
      if (!refetch.error && refetch.data?.id) {
        return { merchantId: refetch.data.id, created: false };
      }
      logSafe('merchant_resolve_blocked_by_deleted', { userId, canonical });
      return { merchantId: null, created: false };
    }

    logWarn('merchant_resolve_insert_error', {
      userId,
      code: error.code,
      message: error.message,
    });
  } catch (err) {
    logWarn('merchant_resolve_insert_threw', {
      userId,
      message: err instanceof Error ? err.message : 'unknown',
    });
  }

  return { merchantId: null, created: false };
}
