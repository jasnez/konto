/**
 * Categorization cascade for parsed bank-statement rows.
 *
 * F2-E4-T1 / docs/01-architecture.md §8 (Categorization Engine).
 *
 * Order of operations (cheapest → most expensive, deterministic):
 *
 *   1. `rule`         — explicit user `categorization_rules`.
 *   2. `alias_exact`  — `merchant_aliases` exact (case-insensitive,
 *                       normalised) match.
 *   3. `alias_fuzzy`  — `merchant_aliases` trigram similarity ≥ 0.75.
 *                       Candidates above 0.6 but below 0.75 deliberately
 *                       fall through to history.
 *   4. `history`      — trigram match against the user's last 1000
 *                       categorised transactions, similarity > 0.7.
 *   5. `llm`          — deferred: LLM fallback is gated on `amountMinor` >
 *                       50 KM (5000 minor units) per the F2-E4-T1 spec.
 *                       Not wired up here yet (Faza 2 may defer); this
 *                       module exposes the hook so callers can plug it in.
 *   6. `none`         — nothing matched.
 *
 * Steps 1–4 run inside a single Postgres function
 * (`public.run_categorization_cascade`) so the cascade is one round-trip.
 * That keeps the per-transaction budget well under the 100ms target —
 * cold plpgsql + four short queries clocks at ~5–20ms in practice; the
 * trigram GIN indexes on `merchant_aliases.pattern` and
 * `transactions.merchant_raw` keep the alias/history scans bounded.
 *
 * Why not split into multiple round-trips? Each Vercel↔Supabase hop is
 * 10–25ms; four sequential queries would alone exhaust the budget on
 * warm pools and devastate it during a 50-row import.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/supabase/types';

/** Sources understood by the cascade. Mirror of `transactions.category_source`
 *  with the alias variants split apart so the review UI can colour-code
 *  exact vs fuzzy matches differently (F2-E4-T2). */
export type CategorizationSource =
  | 'rule'
  | 'alias_exact'
  | 'alias_fuzzy'
  | 'history'
  | 'llm'
  | 'none';

export interface CategorizationInput {
  /** Raw merchant/description string straight from the parser. */
  description: string;
  /** Authenticated user id. The RPC re-derives this from `auth.uid()`;
   *  the parameter exists for API symmetry with the other lib/db helpers,
   *  and is *not* trusted by the RPC. */
  userId: string;
  /** Signed minor units (negative = outflow). Used by rule amount filters
   *  and the (deferred) LLM gating threshold. */
  amountMinor: number;
}

export interface CategorizationResult {
  merchantId?: string;
  categoryId?: string;
  source: CategorizationSource;
  /** 0–1, clamped. 1.0 for `rule` and `alias_exact`. */
  confidence: number;
}

/** Subset of the Supabase client surface the cascade needs. Letting tests
 *  hand in a one-method mock without faking the full client. */
export type CategorizationCascadeClient = Pick<SupabaseClient<Database>, 'rpc'>;

const NONE_RESULT: Readonly<CategorizationResult> = Object.freeze({
  source: 'none' as const,
  confidence: 0,
});

/** LLM gating threshold per F2-E4-T1: only consider an LLM fallback for
 *  transactions worth at least 50 KM (5000 fening). Exposed for tests +
 *  future call sites; the cascade itself does not invoke any LLM today. */
export const LLM_FALLBACK_MIN_AMOUNT_MINOR = 5000;

/**
 * Lowercase + collapse whitespace + strip punctuation.
 *
 * Mirror of the SQL `public.normalize_for_categorization` so callers can
 * pre-normalise on the JS side (e.g. for offline equality checks in
 * `lib/categorization/learn.ts` once F2-E4-T3 lands). The two
 * implementations must stay in lock-step — change both or neither.
 */
export function normalizeDescription(input: string): string {
  return input
    .toLocaleLowerCase('bs-BA')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Run the categorization cascade for a single description/amount pair.
 *
 * Returns `{source: 'none', confidence: 0}` for empty input, RPC errors,
 * or unexpected payload shapes — the caller (a Server Action, typically)
 * is then free to fall through to the LLM step or leave the row
 * uncategorised. We never throw: the cascade is a hint, not an
 * authorisation boundary.
 */
export async function runCategorizationCascade(
  supabase: CategorizationCascadeClient,
  input: CategorizationInput,
): Promise<CategorizationResult> {
  const trimmed = input.description.trim();
  if (trimmed.length === 0) {
    return { ...NONE_RESULT };
  }

  const { data, error } = await supabase.rpc('run_categorization_cascade', {
    p_description: trimmed,
    p_amount_minor: input.amountMinor,
  });

  if (error || data == null) {
    return { ...NONE_RESULT };
  }

  return parseCascadeResult(data);
}

/**
 * Parse a jsonb payload from `run_categorization_cascade` into the
 * typed result. Tolerant of missing/extra fields — anything that fails
 * shape validation collapses to `none`.
 *
 * Exported so the SQL function can be exercised independently in
 * integration tests without re-implementing the parser.
 */
export function parseCascadeResult(payload: Json): CategorizationResult {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...NONE_RESULT };
  }

  const obj: Record<string, Json | undefined> = payload;
  const source = isCategorizationSource(obj.source) ? obj.source : 'none';
  const confidence = clampConfidence(obj.confidence);
  const merchantId = optionalUuid(obj.merchant_id);
  const categoryId = optionalUuid(obj.category_id);

  const result: CategorizationResult = { source, confidence };
  if (merchantId !== undefined) result.merchantId = merchantId;
  if (categoryId !== undefined) result.categoryId = categoryId;
  return result;
}

function isCategorizationSource(value: unknown): value is CategorizationSource {
  return (
    value === 'rule' ||
    value === 'alias_exact' ||
    value === 'alias_fuzzy' ||
    value === 'history' ||
    value === 'llm' ||
    value === 'none'
  );
}

function clampConfidence(value: unknown): number {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    n = Number.parseFloat(value);
  } else {
    return 0;
  }
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function optionalUuid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
