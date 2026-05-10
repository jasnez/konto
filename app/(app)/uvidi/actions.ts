'use server';

/**
 * Server Actions for /uvidi.
 *
 * Two actions:
 *   - `dismissInsight(id)` — marks an insight as dismissed. Standard pattern:
 *     Zod parse → getUser → ownership pre-check → mutation → revalidatePath.
 *   - `regenerateInsights()` — manual trigger of the engine for the current
 *     user. Useful for power users + dev. Rate-limited to one call per 60s
 *     by checking the latest insight's `created_at` for the user — prevents
 *     trivially abusing the engine compute.
 *
 * `archiveInsight` is intentionally absent. The product decision in T1 is
 * that "dismiss" is the only user action; a future "history" UI can query
 * `where dismissed_at is not null`.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInsights } from '@/lib/analytics/insights/engine';
import { logSafe } from '@/lib/logger';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InsightIdSchema = z.uuid({ message: 'Neispravan ID uvida' });

// ─── Result types ─────────────────────────────────────────────────────────────

export type DismissInsightResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type UndismissInsightResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  /** A live insight with the same dedup_key already exists (unique partial
   *  index hit). Tells the UI to surface "Postoji noviji uvid sa istim ključem." */
  | { success: false; error: 'CONFLICT' }
  | { success: false; error: 'DATABASE_ERROR' };

export type RegenerateInsightsResult =
  | { success: true; data: { created: number; skipped: number; errored: number } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { success: false; error: 'DATABASE_ERROR' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rootErrors(error: z.ZodError): string[] {
  return z.treeifyError(error).errors;
}

function revalidateInsightPaths(): void {
  revalidatePath('/uvidi');
  revalidatePath('/pocetna');
}

const REGENERATE_COOLDOWN_SECONDS = 60;

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * @public
 * Dismiss an insight (single-column soft-delete via `dismissed_at`). The
 * insight is hidden from the UI but kept for 90 days (cleanup cron sweeps
 * it after that).
 */
export async function dismissInsight(id: unknown): Promise<DismissInsightResult> {
  const idParse = InsightIdSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: rootErrors(idParse.error) },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // Ownership pre-check. Dismissed-already-dismissed is a no-op success;
  // we don't punish the user for a double-click.
  // IN-1: also fetch `dismissed_at` so a rage-click / hold-down on the
  // dismiss button short-circuits before the UPDATE runs (defeats the
  // 50-dismisses-per-second pattern at the DB without needing a separate
  // rate-limit table).
  const { data: existing, error: selErr } = await supabase
    .from('insights')
    .select('id, dismissed_at')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('dismiss_insight_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }
  // IN-1 short-circuit — already dismissed (timestamp string set), skip the
  // UPDATE entirely. We narrow on `typeof === 'string'` rather than `!== null`
  // so test fixtures that omit the field (undefined) still hit the UPDATE
  // path; DB never returns undefined, only null or a timestamp string.
  if (typeof existing.dismissed_at === 'string') {
    return { success: true };
  }

  const { error: upErr } = await supabase
    .from('insights')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('dismiss_insight_update', {
      userId: user.id,
      insightId: idParse.data,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateInsightPaths();
  return { success: true };
}

/**
 * @public
 * Restore a dismissed insight (set `dismissed_at = null`). Used by the
 * "Vrati" undo toast and by the Arhiva tab "Vrati" button.
 *
 * The unique partial index on `(user_id, dedup_key) WHERE dismissed_at IS NULL`
 * means undismiss can fail with PG `23505` if a fresh insight with the same
 * dedup_key was generated since the original dismiss (e.g., the cron ran in
 * between). We surface that as `CONFLICT` so the UI can show a tailored toast.
 */
export async function undismissInsight(id: unknown): Promise<UndismissInsightResult> {
  const idParse = InsightIdSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: rootErrors(idParse.error) },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: existing, error: selErr } = await supabase
    .from('insights')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('undismiss_insight_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: upErr } = await supabase
    .from('insights')
    .update({ dismissed_at: null })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    // 23505 = unique_violation. Our partial index can fire here if a fresh
    // insight with the same dedup_key was inserted while this one was dismissed.
    if (upErr.code === '23505') {
      return { success: false, error: 'CONFLICT' };
    }
    logSafe('undismiss_insight_update', {
      userId: user.id,
      insightId: idParse.data,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateInsightPaths();
  return { success: true };
}

/**
 * @public
 * Regenerate insights for the current user. Rate-limited to one call per
 * `REGENERATE_COOLDOWN_SECONDS` to prevent compute abuse.
 *
 * Uses the service-role client to write — same path as the nightly cron.
 * The service-role usage is safe because we already validated `user.id`
 * via `auth.getUser()` and the engine scopes every query by `user_id`.
 */
export async function regenerateInsights(): Promise<RegenerateInsightsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // Rate limit: check the most recent insight's created_at.
  const { data: recent, error: recentErr } = await supabase
    .from('insights')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentErr) {
    logSafe('regenerate_insights_recent_check', { userId: user.id, error: recentErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  if (recent !== null) {
    const lastMs = new Date(recent.created_at).getTime();
    const elapsedSec = Math.floor((Date.now() - lastMs) / 1000);
    if (elapsedSec < REGENERATE_COOLDOWN_SECONDS) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        retryAfterSeconds: REGENERATE_COOLDOWN_SECONDS - elapsedSec,
      };
    }
  }

  // Run with service-role client — engine is user-scoped via `user.id`
  // parameter, and we just confirmed the user is authenticated.
  const adminSupabase = createAdminClient();
  let result;
  try {
    result = await generateInsights(adminSupabase, user.id, new Date());
  } catch (err) {
    logSafe('regenerate_insights_engine_error', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateInsightPaths();
  return {
    success: true,
    data: {
      created: result.created,
      skipped: result.skipped,
      errored: result.errored,
    },
  };
}
