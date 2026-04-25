import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

type RateClient = Pick<SupabaseClient<Database>, 'rpc'>;

/** Max POSTs to `/api/imports/[batchId]/parse` per user in the window below. */
export const IMPORT_PARSE_MAX = 5;
/** Parse window: 10 minutes. */
export const IMPORT_PARSE_WINDOW_SEC = 10 * 60;

/** Max new PDF uploads per user in the window below. */
export const IMPORT_UPLOAD_MAX = 20;
/** Upload window: 24h rolling (F2-E5-T2 "daily"). */
export const IMPORT_UPLOAD_WINDOW_SEC = 24 * 60 * 60;

/**
 * F2-E5-T2: enforces a sliding window via `public.rate_limits` + server RPC
 * `check_rate_limit_and_record` (advisory lock + count + insert in one tx).
 */
export async function checkRateLimit(
  supabase: RateClient,
  userId: string,
  action: 'parse' | 'upload',
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit_and_record', {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSec,
  });
  if (error) {
    console.error('check_rate_limit_rpc', { userId, action, error: error.message });
    return false;
  }
  return data;
}
