'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

/**
 * AV-6: Detects and recovers imports stuck in 'parsing' state.
 *
 * Imports can get stuck if the parse route crashes or the server restarts
 * mid-request. After `STUCK_THRESHOLD_SECONDS` with no progress, we mark
 * them as failed so the user can retry or investigate.
 */

/** Route handler maxDuration is 60s; stuck threshold gives a 10-minute grace window. */
const STUCK_THRESHOLD_SECONDS = 10 * 60;

interface RecoverStuckImportsResult {
  success: boolean;
  recovered?: number;
  message?: string;
}

/**
 * Recovers all imports stuck in 'parsing' state for a given user.
 * Called on import-list page load (client-side) to clean up any stuck state.
 */
export async function recoverStuckImports(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<RecoverStuckImportsResult> {
  try {
    // Find imports in 'parsing' state updated more than STUCK_THRESHOLD_SECONDS ago.
    const thresholdTime = new Date(Date.now() - STUCK_THRESHOLD_SECONDS * 1000).toISOString();

    const { data: stuckBatches, error: queryErr } = await supabase
      .from('import_batches')
      .select('id, account_id')
      .eq('user_id', userId)
      .eq('status', 'parsing')
      .lt('updated_at', thresholdTime);

    if (queryErr) {
      logSafe('recover_stuck_imports_query_error', {
        userId,
        error: queryErr.message,
      });
      return { success: false, message: 'Failed to query stuck imports' };
    }

    if (stuckBatches.length === 0) {
      return { success: true, recovered: 0 };
    }

    // Mark each stuck batch as failed with a clear error message.
    const stuckIds = stuckBatches.map((b) => b.id);
    const { error: updateErr } = await supabase
      .from('import_batches')
      .update({
        status: 'failed',
        error_message: 'parsing_timeout',
      })
      .eq('user_id', userId)
      .in('id', stuckIds);

    if (updateErr) {
      logSafe('recover_stuck_imports_update_error', {
        userId,
        count: stuckIds.length,
        error: updateErr.message,
      });
      return { success: false, message: 'Failed to recover stuck imports' };
    }

    logSafe('recover_stuck_imports_success', {
      userId,
      count: stuckIds.length,
    });

    return { success: true, recovered: stuckIds.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logSafe('recover_stuck_imports_unexpected_error', { userId, error: message });
    return { success: false, message };
  }
}
