/**
 * LLM categorization fallback (CLOSEOUT-F2-T2 / cascade step 5).
 *
 * Steps 1–4 of the cascade (rule → alias_exact → alias_fuzzy → history) run
 * inside `run_categorization_cascade` and cover most cases. Anything that
 * still has `source: 'none'` *and* an absolute amount above
 * `LLM_FALLBACK_MIN_AMOUNT_MINOR` (50 KM) is worth a paid LLM lookup —
 * cheap enough per call, expensive enough to warrant caching.
 *
 * Design constraints
 * ──────────────────
 *   - **Batch** up to BATCH_SIZE inputs into a single Gemini call.
 *     Per-row prompts would 20× the token cost.
 *   - **Cache** by (user, normalised description, amount bucket, currency)
 *     for 90 days. The next import hits the cache.
 *   - **Per-user rate limit** of 50 calls/day (tracked in `rate_limits`).
 *     A "call" = one Gemini round-trip, not one categorised row.
 *   - **Confidence floor** of 0.6 — anything below is treated as a miss
 *     and the row stays uncategorised rather than risking a wrong guess.
 *   - **Circuit breaker** (categorizeCircuit, separate from parseCircuit)
 *     so a Gemini parse outage does not poison categorization and vice
 *     versa.
 *   - **No PII** — descriptions are bank-statement merchant strings; the
 *     parse pipeline already runs `redactPII` upstream so we ship them
 *     unmodified.
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { categorizeCircuit, CircuitOpenError } from '@/lib/parser/gemini-circuit-breaker';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';
import { normalizeDescription } from './cascade';

/** Min absolute amount (minor units) for the LLM fallback to fire. 50 KM = 5000. */
export const LLM_FALLBACK_MIN_AMOUNT_MINOR = 5000;

/** Max items per Gemini batch. Above ~20 the structured response gets unstable. */
export const BATCH_SIZE = 20;

/** Soft per-user daily limit (calls = Gemini round-trips, not rows). */
export const LLM_CATEGORIZE_DAILY_LIMIT = 50;
const LLM_CATEGORIZE_WINDOW_SEC = 24 * 60 * 60;

/** Confidence floor — anything below this is treated as a miss. */
export const LLM_CONFIDENCE_THRESHOLD = 0.6;

/** Cache TTL — 90 days. Refreshed on every hit. */
const CACHE_TTL_DAYS = 90;

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_TIMEOUT_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMCategorizeItem {
  /** Raw description from the parser (already PII-redacted upstream). */
  description: string;
  /** Signed minor units. Used for amount bucketing in the cache key. */
  amountMinor: number;
  /** ISO 4217 currency. Lowercased before hitting cache lookups. */
  currency: string;
}

export interface LLMCategorizeResultRow {
  categoryId: string | null;
  confidence: number;
  /** Where the result came from. 'none' = miss / below threshold. */
  source: 'llm' | 'llm_cache' | 'none';
}

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
}

// ─── Public entry point ──────────────────────────────────────────────────────

type CategorizeClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

/**
 * Categorize a batch of unmatched transactions via the LLM fallback.
 *
 * Returns one result per input, in order. Results that miss the cache
 * *and* fail the rate limit / circuit / confidence checks come back as
 * `{ categoryId: null, confidence: 0, source: 'none' }` — caller should
 * leave the row untouched in that case.
 *
 * Inputs are deduped internally on the cache key so the same description
 * appearing twice in a batch only costs one Gemini token.
 */
export async function llmCategorizeBatch(
  supabase: CategorizeClient,
  userId: string,
  items: readonly LLMCategorizeItem[],
): Promise<LLMCategorizeResultRow[]> {
  if (items.length === 0) return [];

  // Pre-allocate so callers can safely index into the result array.
  const out: LLMCategorizeResultRow[] = items.map(() => ({
    categoryId: null,
    confidence: 0,
    source: 'none',
  }));

  // 1. Build cache keys per row, then look them up in bulk.
  const keys = items.map((it) => buildCacheKey(it));
  const cacheHits = await readCache(supabase, userId, keys);

  // 2. Anything not in cache is a candidate for the Gemini call.
  const candidates: { index: number; key: CacheKey; item: LLMCategorizeItem }[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const key = keys[i];
    const item = items[i];
    const hit = cacheHits.get(cacheKeyHash(key));
    if (hit) {
      out[i] = {
        categoryId: hit.categoryId,
        confidence: hit.confidence,
        source: 'llm_cache',
      };
      continue;
    }
    candidates.push({ index: i, key, item });
  }

  if (candidates.length === 0) return out;

  // 3. Rate limit gate — one row per Gemini call (not per item).
  const allowed = await checkLlmCategorizeRateLimit(supabase, userId);
  if (!allowed) {
    logSafe('llm_categorize_rate_limited', { userId, candidateCount: candidates.length });
    return out;
  }

  // 4. Circuit breaker gate.
  try {
    categorizeCircuit.guard();
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      logSafe('llm_categorize_circuit_open', { userId });
      return out;
    }
    throw err;
  }

  // 5. Load user's categories — Gemini needs the legal output set.
  const categories = await loadEligibleCategories(supabase, userId);
  if (categories.length === 0) {
    logSafe('llm_categorize_no_categories', { userId });
    return out;
  }

  // 6. Dedup candidates on cache key — many rows can share normalised text.
  const uniqueByKey = new Map<string, { key: CacheKey; item: LLMCategorizeItem }>();
  for (const c of candidates) {
    const h = cacheKeyHash(c.key);
    if (!uniqueByKey.has(h)) {
      uniqueByKey.set(h, { key: c.key, item: c.item });
    }
  }
  const unique = [...uniqueByKey.values()];

  // 7. Chunk into BATCH_SIZE-sized Gemini calls.
  const apiResponses = new Map<string, { categoryId: string | null; confidence: number }>();
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    let response: GeminiCategorizeResponse;
    try {
      response = await callGemini(chunk, categories);
      categorizeCircuit.onSuccess();
    } catch (err) {
      categorizeCircuit.onFailure();
      logSafe('llm_categorize_gemini_error', {
        userId,
        chunkSize: chunk.length,
        error: err instanceof Error ? err.message : String(err),
      });
      // Bail on remaining chunks — circuit may have just opened.
      break;
    }
    for (let j = 0; j < chunk.length; j += 1) {
      const slot = response.results[j];
      // Defensive: Gemini sometimes returns fewer results than asked.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!slot) continue;
      const key = chunk[j].key;
      apiResponses.set(cacheKeyHash(key), {
        categoryId:
          slot.confidence >= LLM_CONFIDENCE_THRESHOLD &&
          slot.categoryId &&
          categories.some((c) => c.id === slot.categoryId)
            ? slot.categoryId
            : null,
        confidence: clampConfidence(slot.confidence),
      });
    }
  }

  // 8. Persist into cache (best-effort: log + continue on failure).
  if (apiResponses.size > 0) {
    await writeCache(supabase, userId, apiResponses, [...uniqueByKey.values()]);
  }

  // 9. Project responses back onto the original input ordering.
  for (const c of candidates) {
    const resolved = apiResponses.get(cacheKeyHash(c.key));
    if (!resolved) continue;
    out[c.index] = {
      categoryId: resolved.categoryId,
      confidence: resolved.confidence,
      source: 'llm',
    };
  }
  return out;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

interface CacheKey {
  descriptionNormalized: string;
  amountBucket: number;
  currency: string;
}

function buildCacheKey(item: LLMCategorizeItem): CacheKey {
  return {
    descriptionNormalized: normalizeDescription(item.description),
    amountBucket: amountBucketFor(item.amountMinor),
    currency: item.currency.toUpperCase(),
  };
}

function cacheKeyHash(k: CacheKey): string {
  return `${k.descriptionNormalized}␟${String(k.amountBucket)}␟${k.currency}`;
}

/**
 * Bucket an amount in minor units to keep cache hit rates high while still
 * separating wildly different ticket sizes for the same merchant. Buckets:
 *   - up to 100_000 minor units (1000 KM): rounded to the nearest 5000 (50 KM).
 *   - above:                               rounded to the nearest 50000 (500 KM).
 *
 * Sign is preserved (refunds vs. expenses bucket separately). Exported for
 * tests so the bucketing math is verifiable end-to-end.
 */
export function amountBucketFor(amountMinor: number): number {
  const sign = amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(amountMinor);
  const bucket = abs <= 100_000 ? Math.round(abs / 5000) * 5000 : Math.round(abs / 50_000) * 50_000;
  return sign * bucket;
}

interface CacheRow {
  description_normalized: string;
  amount_bucket: number;
  currency: string;
  category_id: string | null;
  confidence: number;
}

async function readCache(
  supabase: CategorizeClient,
  userId: string,
  keys: readonly CacheKey[],
): Promise<Map<string, { categoryId: string | null; confidence: number }>> {
  const out = new Map<string, { categoryId: string | null; confidence: number }>();
  if (keys.length === 0) return out;

  const dedup = new Map<string, CacheKey>();
  for (const k of keys) dedup.set(cacheKeyHash(k), k);
  const unique = [...dedup.values()];

  // PostgREST has no batch tuple-equality, so query by description_normalized
  // (the most selective column) and filter on the client.
  const norms = [...new Set(unique.map((k) => k.descriptionNormalized))];
  const { data, error } = await supabase
    .from('llm_categorization_cache')
    .select('description_normalized, amount_bucket, currency, category_id, confidence')
    .eq('user_id', userId)
    .in('description_normalized', norms)
    .gt('expires_at', new Date().toISOString());

  if (error) {
    logSafe('llm_categorize_cache_read_error', { userId, error: error.message });
    return out;
  }

  const want = new Set(unique.map((k) => cacheKeyHash(k)));
  for (const row of (data as CacheRow[] | null) ?? []) {
    const h = cacheKeyHash({
      descriptionNormalized: row.description_normalized,
      amountBucket: row.amount_bucket,
      currency: row.currency,
    });
    if (want.has(h)) {
      out.set(h, {
        categoryId: row.category_id,
        confidence: row.confidence,
      });
    }
  }
  return out;
}

async function writeCache(
  supabase: CategorizeClient,
  userId: string,
  responses: Map<string, { categoryId: string | null; confidence: number }>,
  uniques: { key: CacheKey; item: LLMCategorizeItem }[],
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows: Database['public']['Tables']['llm_categorization_cache']['Insert'][] = [];
  for (const { key } of uniques) {
    const r = responses.get(cacheKeyHash(key));
    if (!r) continue;
    rows.push({
      user_id: userId,
      description_normalized: key.descriptionNormalized,
      amount_bucket: key.amountBucket,
      currency: key.currency,
      category_id: r.categoryId,
      // Cap to 2 decimals to match numeric(3,2) column.
      confidence: Math.round(r.confidence * 100) / 100,
      expires_at: expiresAt,
    });
  }
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('llm_categorization_cache')
    .upsert(rows, { onConflict: 'user_id,description_normalized,amount_bucket,currency' });
  if (error) {
    logSafe('llm_categorize_cache_write_error', { userId, error: error.message });
  }
}

// ─── Rate limit + categories ──────────────────────────────────────────────────

async function checkLlmCategorizeRateLimit(
  supabase: CategorizeClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit_and_record', {
    p_user_id: userId,
    p_action: 'llm_categorize',
    p_limit: LLM_CATEGORIZE_DAILY_LIMIT,
    p_window_seconds: LLM_CATEGORIZE_WINDOW_SEC,
  });
  if (error) {
    logSafe('llm_categorize_rate_limit_error', { userId, error: error.message });
    return false;
  }
  return data;
}

async function loadEligibleCategories(
  supabase: CategorizeClient,
  userId: string,
): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, icon')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('kind', ['expense', 'income']);

  if (error) {
    logSafe('llm_categorize_categories_error', { userId, error: error.message });
    return [];
  }
  return data;
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

const GeminiResultSchema = z.object({
  results: z.array(
    z.object({
      categoryId: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
});
type GeminiCategorizeResponse = z.infer<typeof GeminiResultSchema>;

const SYSTEM_PROMPT = `
Ti si asistent koji klasifikuje bankovne transakcije u predefinisane kategorije korisnika.

Pravila:
1. Dobit ćeš listu kategorija (id, ime, vrsta) i listu transakcija (opis, iznos, valuta).
2. Vrati JSON sa "results" nizom: za svaku transakciju u istom redoslijedu vrati { categoryId, confidence }.
3. confidence je broj 0.0–1.0:
   - 0.9+ kad je trgovac jasan i kategorija očigledna (npr. "BINGO" → Hrana i piće).
   - 0.6–0.9 kad je vjerovatno ali nesigurno.
   - <0.6 kad nisi siguran. U tom slučaju vrati categoryId=null.
4. Koristi SAMO id-jeve iz date liste kategorija. Ne izmišljaj.
5. Razmatraj smjer iznosa: negativan = trošak (kind=expense), pozitivan = priliv (kind=income).
6. Ako nijedna kategorija ne paše, vrati categoryId=null sa confidence=0.
7. Ne vraćaj objašnjenja niti markdown — samo JSON.
`.trim();

async function callGemini(
  chunk: { key: CacheKey; item: LLMCategorizeItem }[],
  categories: CategoryRow[],
): Promise<GeminiCategorizeResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nije konfigurisan.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          results: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                categoryId: { type: SchemaType.STRING, nullable: true },
                confidence: { type: SchemaType.NUMBER },
              },
              required: ['categoryId', 'confidence'],
            },
          },
        },
        required: ['results'],
      },
    },
  });

  const prompt = JSON.stringify({
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    transactions: chunk.map(({ item }) => ({
      description: item.description,
      amountMinor: item.amountMinor,
      currency: item.currency,
    })),
  });

  const result = await model.generateContent(prompt, { timeout: GEMINI_TIMEOUT_MS });
  const raw = result.response.text();
  const parsed: unknown = JSON.parse(raw);
  return GeminiResultSchema.parse(parsed);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
