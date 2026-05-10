/**
 * Insights engine.
 *
 * Public API:
 *   - `generateInsights(supabase, userId, today?) → Promise<EngineResult>`
 *   - `loadDetectorContext(...)` (exported for tests / advanced callers)
 *
 * Flow:
 *   1. Pre-load context for the user (transactions, budgets, recurring,
 *      accounts, live dedup keys). Single round of queries.
 *   2. Cold-start guard: if total transaction count < 30, return early.
 *      No usable signal yet.
 *   3. Run each detector inside try/catch. Errors are logged via `logSafe`
 *      and the detector is marked `errored`; the run continues.
 *   4. Filter outputs by `liveDedupKeys` so the same insight isn't created
 *      twice.
 *   5. Batch INSERT remaining insights. The unique partial index in the DB
 *      is a belt-and-suspenders safety net — duplicate inserts are unlikely
 *      because of the client-side filter, but races with `regenerateInsights`
 *      could theoretically produce them. We don't catch the conflict error
 *      because the engine's caller (cron / Server Action) treats DB errors
 *      uniformly via `logSafe`.
 *
 * Caller contract:
 *   - The caller MUST scope the supabase client to the right user. The engine
 *     filters by `user_id` everywhere, but it does NOT verify that the
 *     `userId` parameter matches `auth.uid()` of the supabase client. That
 *     check belongs at the call site (Server Action or cron, both of which
 *     own the trust boundary).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';
import { listBudgetsWithSpent } from '@/lib/queries/budgets';
import { listActiveRecurring } from '@/lib/queries/recurring';
import { ALL_DETECTORS } from './detectors';
import type {
  Detector,
  DetectorContext,
  EngineResult,
  Insight,
  InsightsAccountRow,
  InsightsTxRow,
} from './types';

type EngineSupabaseClient = SupabaseClient<Database>;

const COLD_START_MIN_TX = 30;
const TX_LOOKBACK_DAYS = 120;

// ─── Insert-shape mapping ─────────────────────────────────────────────────────

type InsightInsert = Database['public']['Tables']['insights']['Insert'];

function toInsertRow(userId: string, insight: Insight): InsightInsert {
  // Cap defensively to match DB constraints. The detectors should respect
  // these but truncating here protects against a future detector slipping
  // a long body past review.
  const truncatedBody = insight.body.length > 2000 ? insight.body.slice(0, 2000) : insight.body;
  const truncatedTitle = insight.title.length > 200 ? insight.title.slice(0, 200) : insight.title;

  return {
    user_id: userId,
    type: insight.type,
    severity: insight.severity,
    title: truncatedTitle,
    body: truncatedBody,
    action_url: insight.actionUrl ?? null,
    dedup_key: insight.dedupKey,
    metadata: (insight.metadata ?? {}) as InsightInsert['metadata'],
    valid_until: insight.validUntil?.toISOString() ?? null,
  };
}

// ─── Preload helpers ──────────────────────────────────────────────────────────

interface MerchantJoin {
  display_name: string | null;
}
interface CategoryJoin {
  name: string | null;
  kind: string | null;
}
interface RawTxRow {
  id: string;
  transaction_date: string;
  base_amount_cents: number;
  currency: string;
  category_id: string | null;
  recurring_id: string | null;
  // Supabase returns the join as an object for one-to-one or as null when no
  // FK match. We don't see arrays here because both merchants and categories
  // are PK-referenced one-per-row.
  merchants: MerchantJoin | null;
  categories: CategoryJoin | null;
}

const ALLOWED_KINDS = new Set(['expense', 'income', 'transfer', 'saving', 'other']);

function asKind(s: string | null | undefined): InsightsTxRow['categoryKind'] {
  if (s !== null && s !== undefined && ALLOWED_KINDS.has(s)) {
    return s as InsightsTxRow['categoryKind'];
  }
  return 'other';
}

async function loadTransactions(
  supabase: EngineSupabaseClient,
  userId: string,
  fromIsoDate: string,
): Promise<InsightsTxRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(
      `id, transaction_date, base_amount_cents, currency, category_id, recurring_id,
       merchants(display_name),
       categories(name, kind)`,
    )
    .eq('user_id', userId)
    .gte('transaction_date', fromIsoDate)
    .eq('is_excluded', false)
    .eq('is_transfer', false)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .limit(5000); // hard cap defensive against runaway accounts

  if (error) {
    logSafe('insights.engine.tx_load_error', { userId, error: error.message });
    return [];
  }
  const rows = data as unknown as RawTxRow[];
  return rows.map((r) => ({
    id: r.id,
    transactionDate: r.transaction_date,
    baseAmountCents: BigInt(r.base_amount_cents),
    currency: r.currency,
    categoryId: r.category_id,
    recurringId: r.recurring_id,
    merchantName: r.merchants?.display_name ?? null,
    categoryName: r.categories?.name ?? null,
    categoryKind: asKind(r.categories?.kind ?? null),
  }));
}

async function loadAccounts(
  supabase: EngineSupabaseClient,
  userId: string,
): Promise<InsightsAccountRow[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, currency, current_balance_cents')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) {
    logSafe('insights.engine.accounts_load_error', { userId, error: error.message });
    return [];
  }
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    currency: r.currency,
    baseBalanceCents: BigInt(r.current_balance_cents),
  }));
}

async function loadLiveDedupKeys(
  supabase: EngineSupabaseClient,
  userId: string,
  today: Date,
): Promise<Set<string>> {
  const todayIso = today.toISOString();
  const { data, error } = await supabase
    .from('insights')
    .select('dedup_key')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .or(`valid_until.is.null,valid_until.gt.${todayIso}`);

  if (error) {
    logSafe('insights.engine.live_keys_load_error', { userId, error: error.message });
    return new Set<string>();
  }
  return new Set<string>(data.map((r) => r.dedup_key));
}

async function loadBaseCurrency(supabase: EngineSupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', userId)
    .maybeSingle();
  if (error || data === null) return 'BAM';
  return data.base_currency;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-loads all data needed by detectors. Exported separately so tests can
 * build a fully-formed context against a mock supabase, then call individual
 * detectors directly without going through the engine.
 */
export async function loadDetectorContext(
  supabase: EngineSupabaseClient,
  userId: string,
  today: Date,
): Promise<DetectorContext | null> {
  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - TX_LOOKBACK_DAYS);
  const fromIsoDate = fromDate.toISOString().slice(0, 10);

  const [transactions, budgets, recurring, accounts, liveDedupKeys, baseCurrency] =
    await Promise.all([
      loadTransactions(supabase, userId, fromIsoDate),
      listBudgetsWithSpent(supabase, userId, { today }),
      listActiveRecurring(supabase, userId, { now: today }),
      loadAccounts(supabase, userId),
      loadLiveDedupKeys(supabase, userId, today),
      loadBaseCurrency(supabase, userId),
    ]);

  if (transactions.length < COLD_START_MIN_TX) {
    return null;
  }

  return {
    userId,
    supabase,
    baseCurrency,
    today,
    transactions,
    budgets,
    recurring,
    accounts,
    liveDedupKeys,
  };
}

/**
 * Runs all detectors for a user and persists fresh insights. Idempotent
 * across runs thanks to client-side dedup + DB unique partial index.
 */
export async function generateInsights(
  supabase: EngineSupabaseClient,
  userId: string,
  today: Date = new Date(),
): Promise<EngineResult> {
  const result: EngineResult = {
    created: 0,
    skipped: 0,
    errored: 0,
    byDetector: {},
  };

  const ctx = await loadDetectorContext(supabase, userId, today);
  if (ctx === null) {
    logSafe('insights.engine.cold_start_skip', { userId });
    return result;
  }

  const fresh: Insight[] = [];

  for (const detector of ALL_DETECTORS) {
    const stat = { created: 0, skipped: 0, errored: false };
    result.byDetector[detector.id] = stat;
    try {
      const emitted = runDetectorSafe(detector, ctx);
      for (const ins of emitted) {
        if (ctx.liveDedupKeys.has(ins.dedupKey)) {
          stat.skipped += 1;
          result.skipped += 1;
          continue;
        }
        // Also dedup within the same run (a detector emitting the same key
        // twice for two different scopes is a bug, but be defensive).
        if (fresh.some((f) => f.dedupKey === ins.dedupKey)) {
          stat.skipped += 1;
          result.skipped += 1;
          continue;
        }
        fresh.push(ins);
        stat.created += 1;
      }
    } catch (err) {
      stat.errored = true;
      result.errored += 1;
      logSafe('insights.engine.detector_error', {
        userId,
        detectorId: detector.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (fresh.length === 0) {
    return result;
  }

  const rows = fresh.map((ins) => toInsertRow(userId, ins));

  // MT-12 (Low): pre-delete expired insights with the same dedup_key. The
  // unique partial index `idx_insights_user_dedup_active` excludes
  // dismissed_at IS NOT NULL but cannot exclude `valid_until < now()`
  // (Postgres requires partial-index predicates to be IMMUTABLE, and
  // `now()` isn't). The daily cleanup cron only sweeps once a day; if a
  // detector regenerates between cron runs and the previous insight has
  // expired, the new INSERT trips the unique constraint and the whole
  // batch fails. Pre-deleting expired-with-same-key in the same call
  // closes the gap without a schema change.
  const dedupKeys = fresh.map((ins) => ins.dedupKey);
  const todayIso = today.toISOString();
  const { error: precleanError } = await supabase
    .from('insights')
    .delete()
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .in('dedup_key', dedupKeys)
    .lt('valid_until', todayIso);
  if (precleanError) {
    // Non-fatal: log and continue. If a real conflict still exists the
    // INSERT below will surface it.
    logSafe('insights.engine.preclean_error', {
      userId,
      error: precleanError.message,
    });
  }

  const { data, error } = await supabase.from('insights').insert(rows).select('id');
  if (error) {
    logSafe('insights.engine.insert_error', {
      userId,
      error: error.message,
      attempted: rows.length,
    });
    // Reset created counts since the batch failed.
    result.created = 0;
    return result;
  }
  result.created = data.length;
  return result;
}

/**
 * Wraps a detector's `run` to convert async returns to sync. Detectors are
 * documented as pure-sync but the runtime accepts a Promise<Insight[]> for
 * future flexibility — currently we await synchronously and unwrap.
 *
 * Throwing here propagates to `generateInsights`'s try/catch.
 */
function runDetectorSafe(detector: Detector, ctx: DetectorContext): Insight[] {
  const out = detector.run(ctx);
  // Defensive: detector returned a value that isn't an array.
  if (!Array.isArray(out)) {
    throw new Error(`Detector ${detector.id} returned non-array`);
  }
  return out;
}
