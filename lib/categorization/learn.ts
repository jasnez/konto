/**
 * Learning loop for the categorization cascade.
 *
 * Spec: docs/01-architecture.md §8.3 (Kontinualno učenje).
 *
 * Whenever the user overrides a non-deterministic categorization suggestion
 * (anything other than `rule` or `alias_exact`), the import-review Server
 * Action calls into here:
 *
 *   1. {@link recordCorrection} appends a row to `public.user_corrections`
 *      so we have a per-user ledger of "the cascade said X, the user picked
 *      Y for description D". Append-only by RLS — see migration
 *      20260502140000_00031_user_corrections.sql.
 *
 *   2. {@link maybeCreateAlias} checks the ledger for the same normalised
 *      description: if the user has corrected it to the *same* category
 *      `LEARNING_THRESHOLD` (3) times without ambiguity, we materialise a
 *      `merchant_alias`. The next parse will hit `alias_exact` and skip the
 *      cascade entirely.
 *
 * Why two functions, not one
 * --------------------------
 * The Server Action wants the correction recorded *before* deciding whether
 * to surface a "Naučio sam…" toast. Splitting the steps lets the action
 * always record the signal (cheap, append-only) and only conditionally
 * trigger the more expensive read+insert+insert that materialises the
 * alias. It also makes both halves trivially unit-testable in isolation.
 *
 * Why we don't throw
 * ------------------
 * Learning is best-effort. A failed correction must never make the user's
 * category change look broken. Both functions return `{ ok: false, ... }`
 * shapes and the caller treats failure as "don't notify, don't retry". The
 * eventual signal will still come through on the next correction.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeDescription } from '@/lib/categorization/cascade';
import type { CategorizationSource } from '@/lib/categorization/cascade';
import type { Database } from '@/supabase/types';
import { logSafe, logWarn } from '@/lib/logger';

/** Number of identical corrections before we promote to an alias. The
 *  spec wants exactly 3 (docs/01-architecture.md §8.3, F2-E4-T3). */
export const LEARNING_THRESHOLD = 3;

/** Cap how far back we look when scoring a description. Older corrections
 *  may reflect categories the user has since reorganised; capping keeps the
 *  query bounded and prevents stale signal from blocking a fresh consensus. */
const RECENT_CORRECTIONS_LIMIT = 50;

/** Hard cap on the text we copy into a merchant/alias canonical column.
 *  The DB schema doesn't enforce a length but we don't want a 4 KB OCR blob
 *  to leak in. 200 mirrors the longest real-world merchant_raw we see in
 *  golden fixtures. */
const MERCHANT_TEXT_MAX = 200;

/** Subset of the Supabase server client we actually need. Lets tests pass
 *  in a one-method mock without recreating the entire surface. */
export type LearnClient = Pick<SupabaseClient<Database>, 'from'>;

export interface RecordCorrectionInput {
  /** Authenticated user id (defence-in-depth on top of RLS). */
  userId: string;
  /** Raw merchant string the user corrected on. Empty/whitespace input is
   *  rejected — there is nothing to learn from. */
  originalDescription: string;
  /** New category id (uuid) the user chose. `null` when the user cleared
   *  the category — we still record the signal so we don't silently lose
   *  it, but it never contributes to alias creation. */
  newCategoryId: string | null;
  /** Optional context the action can pass through. Stored for future audit
   *  / analytics; not used by the learning logic itself today. */
  oldCategoryId?: string | null;
  sourceBefore?: CategorizationSource | null;
  confidenceBefore?: number | null;
  /** When the correction comes from a real `transactions` row (post-import),
   *  pass the FK so we can join back later. Parsed-row corrections leave
   *  this null — the staging row may have been deleted by `finalizeImport`
   *  before the learner runs. */
  transactionId?: string | null;
}

export interface RecordCorrectionResult {
  ok: boolean;
  /** Normalised description we wrote (or attempted to write). Useful for
   *  the action to immediately call `maybeCreateAlias` with the same key. */
  normalizedDescription: string;
}

/**
 * Append a `user_corrections` row for the given override.
 *
 * Returns `ok: false` for inputs that have no learning value (empty
 * description) or when the insert fails — the caller should *not* surface
 * the failure as a user-facing error.
 */
export async function recordCorrection(
  supabase: LearnClient,
  input: RecordCorrectionInput,
): Promise<RecordCorrectionResult> {
  const trimmed = input.originalDescription.trim();
  const normalized = normalizeDescription(trimmed);
  if (normalized.length === 0) {
    return { ok: false, normalizedDescription: '' };
  }

  const insert: Database['public']['Tables']['user_corrections']['Insert'] = {
    user_id: input.userId,
    field: 'category',
    description_raw: trimmed.slice(0, MERCHANT_TEXT_MAX),
    description_normalized: normalized,
    new_value: input.newCategoryId,
    old_value: input.oldCategoryId ?? null,
    source_before: input.sourceBefore ?? null,
    confidence_before: input.confidenceBefore ?? null,
    transaction_id: input.transactionId ?? null,
  };

  const { error } = await supabase.from('user_corrections').insert(insert);
  if (error) {
    logSafe('record_correction_insert_error', {
      userId: input.userId,
      error: error.message,
    });
    return { ok: false, normalizedDescription: normalized };
  }
  return { ok: true, normalizedDescription: normalized };
}

export interface MaybeCreateAliasArgs {
  userId: string;
  /** Raw description the user corrected on. We re-normalise here so callers
   *  don't have to keep the JS/SQL helpers in sync. */
  description: string;
  /** Category the user keeps choosing. */
  categoryId: string;
}

export type MaybeCreateAliasResult =
  | { created: false; reason: 'BELOW_THRESHOLD' | 'AMBIGUOUS' | 'ALIAS_EXISTS' | 'EMPTY' | 'ERROR' }
  | { created: true; aliasId: string; merchantId: string };

/**
 * Check if the user has converged on a single category for this description
 * and, if so, materialise a `merchant_alias`.
 *
 * The decision is taken from the most recent {@link RECENT_CORRECTIONS_LIMIT}
 * `user_corrections` rows for the user + normalised description with
 * `field='category'`:
 *
 *   - The target category must appear ≥ {@link LEARNING_THRESHOLD} times.
 *   - No *other* category may also reach the threshold (ambiguous → bail).
 *
 * If both checks pass and no alias exists yet for this normalised pattern,
 * we ensure a merchant exists (reuse case-insensitive match by canonical
 * name, otherwise create one with the chosen category as the default) and
 * insert the alias. The alias keys off `pattern_type='contains'` so future
 * `alias_exact` lookups normalise both sides via
 * `normalize_for_categorization` and match.
 *
 * Returns a discriminated union so the caller can render specific UI
 * (today: only `created: true` triggers the toast; the other cases are
 * silent so we don't spam the user with explanations of the heuristic).
 */
export async function maybeCreateAlias(
  supabase: LearnClient,
  args: MaybeCreateAliasArgs,
): Promise<MaybeCreateAliasResult> {
  const trimmed = args.description.trim();
  const normalized = normalizeDescription(trimmed);
  if (normalized.length === 0 || args.categoryId.length === 0) {
    return { created: false, reason: 'EMPTY' };
  }

  // 1. Pull recent corrections for this normalised pattern.
  const { data: corrections, error: corrErr } = await supabase
    .from('user_corrections')
    .select('new_value')
    .eq('user_id', args.userId)
    .eq('field', 'category')
    .eq('description_normalized', normalized)
    .order('created_at', { ascending: false })
    .limit(RECENT_CORRECTIONS_LIMIT);

  if (corrErr) {
    logSafe('maybe_create_alias_select_corrections_error', {
      userId: args.userId,
      error: corrErr.message,
    });
    return { created: false, reason: 'ERROR' };
  }

  const counts = new Map<string, number>();
  for (const row of corrections) {
    const v = row.new_value;
    if (typeof v !== 'string' || v.length === 0) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const targetCount = counts.get(args.categoryId) ?? 0;
  if (targetCount < LEARNING_THRESHOLD) {
    return { created: false, reason: 'BELOW_THRESHOLD' };
  }
  for (const [cat, n] of counts) {
    if (cat !== args.categoryId && n >= LEARNING_THRESHOLD) {
      return { created: false, reason: 'AMBIGUOUS' };
    }
  }

  // 2. If we already have an alias for this normalised pattern, do nothing.
  // We can't filter by normalised pattern in SQL (no functional index), so
  // we pull the user's aliases and dedupe in JS. Alias counts per user are
  // small (tens, hundreds at most) so this is cheap.
  const { data: aliases, error: aliasErr } = await supabase
    .from('merchant_aliases')
    .select('id, merchant_id, pattern')
    .eq('user_id', args.userId);

  if (aliasErr) {
    logSafe('maybe_create_alias_select_aliases_error', {
      userId: args.userId,
      error: aliasErr.message,
    });
    return { created: false, reason: 'ERROR' };
  }

  for (const a of aliases) {
    if (normalizeDescription(a.pattern) === normalized) {
      return { created: false, reason: 'ALIAS_EXISTS' };
    }
  }

  // 3. Find or create a merchant for this user. Reuse case-insensitive
  // canonical_name matches so we don't end up with both "Konzum" and
  // "KONZUM" as separate merchants. Skip soft-deleted rows.
  const merchantText = (trimmed.length > 0 ? trimmed : normalized).slice(0, MERCHANT_TEXT_MAX);

  const { data: existingMerchants, error: findMerchErr } = await supabase
    .from('merchants')
    .select('id, default_category_id')
    .eq('user_id', args.userId)
    .is('deleted_at', null)
    .ilike('canonical_name', merchantText)
    .limit(1);

  if (findMerchErr) {
    logSafe('maybe_create_alias_find_merchant_error', {
      userId: args.userId,
      error: findMerchErr.message,
    });
    return { created: false, reason: 'ERROR' };
  }

  let merchantId: string;
  if (existingMerchants.length > 0) {
    const existingMerchant = existingMerchants[0];
    merchantId = existingMerchant.id;
    if (existingMerchant.default_category_id === null) {
      // Don't overwrite an explicit choice the user made elsewhere; only
      // backfill when nothing was set.
      const { error: setDefaultErr } = await supabase
        .from('merchants')
        .update({ default_category_id: args.categoryId })
        .eq('id', merchantId)
        .eq('user_id', args.userId);
      if (setDefaultErr) {
        logWarn('maybe_create_alias_set_default_category_error', {
          userId: args.userId,
          error: setDefaultErr.message,
        });
        // Non-fatal — the alias still works without it.
      }
    }
  } else {
    const { data: created, error: insMerchErr } = await supabase
      .from('merchants')
      .insert({
        user_id: args.userId,
        canonical_name: merchantText,
        display_name: merchantText,
        default_category_id: args.categoryId,
      })
      .select('id')
      .single();
    if (insMerchErr) {
      logSafe('maybe_create_alias_insert_merchant_error', {
        userId: args.userId,
        error: insMerchErr.message,
      });
      return { created: false, reason: 'ERROR' };
    }
    merchantId = created.id;
  }

  // 4. Finally, the alias itself. `pattern_type='contains'` matches the
  // RLS policy and is what `run_categorization_cascade` looks for.
  const { data: aliasRow, error: insAliasErr } = await supabase
    .from('merchant_aliases')
    .insert({
      user_id: args.userId,
      merchant_id: merchantId,
      pattern: merchantText,
      pattern_type: 'contains',
    })
    .select('id')
    .single();

  if (insAliasErr) {
    logSafe('maybe_create_alias_insert_alias_error', {
      userId: args.userId,
      error: insAliasErr.message,
    });
    return { created: false, reason: 'ERROR' };
  }

  return { created: true, aliasId: aliasRow.id, merchantId };
}
