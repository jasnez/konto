import type { SupabaseClient } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';

/** AV-2 watchdog SLA: a batch sitting in `enqueued`/`parsing` longer than
 *  this is considered stranded.
 *
 *  Sized to comfortably exceed the legitimate worst-case async run:
 *    - Gemini timeout (lib/parser/llm-parse.ts:GEMINI_TIMEOUT_MS) = 90s
 *    - withRetry: 3 attempts with 1s + 2s backoff = up to 273s
 *    - PDF extraction + DB writes ≈ 15s
 *    - Total legitimate worst case ≈ 290s
 *
 *  600s gives ~310s headroom for unexpectedly slow Gemini responses on
 *  large statements, while still bounding how long a genuinely stuck
 *  batch can stay in flight before the user sees a `parsing_timeout`
 *  failure. If GEMINI_TIMEOUT_MS or the retry policy changes, this
 *  constant must stay at least 2× the new worst case. */
export const STUCK_THRESHOLD_SECONDS = 600;

export async function sweepStuckImports(
  supabase: SupabaseClient<Database>,
): Promise<{ recovered: number }> {
  const thresholdIso = new Date(Date.now() - STUCK_THRESHOLD_SECONDS * 1000).toISOString();

  const { data: stuck, error: queryErr } = await supabase
    .from('import_batches')
    .select('id, user_id, status, updated_at')
    .in('status', ['enqueued', 'parsing'])
    .lt('updated_at', thresholdIso)
    .limit(200);

  if (queryErr) {
    logSafe('watchdog_query_error', { error: queryErr.message });
    throw new Error(`watchdog_query_failed: ${queryErr.message}`);
  }
  if (stuck.length === 0) {
    return { recovered: 0 };
  }

  const ids = stuck.map((b) => b.id);
  // eslint-disable-next-line local/no-unguarded-mutation -- cross-user sweep by design; admin client + id-list scoping
  const { error: updateErr } = await supabase
    .from('import_batches')
    .update({ status: 'failed', error_message: 'parsing_timeout' })
    .in('id', ids);

  if (updateErr) {
    logSafe('watchdog_update_error', { count: ids.length, error: updateErr.message });
    throw new Error(`watchdog_update_failed: ${updateErr.message}`);
  }

  logSafe('watchdog_recovered_stuck', { count: ids.length });
  return { recovered: ids.length };
}

/**
 * Inngest scheduled cron: runs every minute, marks batches that have been
 * `enqueued` or `parsing` longer than STUCK_THRESHOLD_SECONDS as `failed`.
 * Replaces the user-load-time recovery in lib/server/actions/recover-stuck-imports.ts
 * for the async path, where the user is not actively on the page.
 */
export const watchdogStuckImportsFn = inngest.createFunction(
  {
    id: 'watchdog-stuck-imports',
    name: 'Watchdog: stuck imports',
    triggers: [{ cron: '* * * * *' }],
  },
  async ({ step }) => {
    return step.run('sweep-stuck', () => sweepStuckImports(createAdminClient()));
  },
);
