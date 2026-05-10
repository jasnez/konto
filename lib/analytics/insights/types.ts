/**
 * Insights engine types.
 *
 * The engine is **synchronous in spirit**: each detector is a pure function
 * over a pre-loaded `DetectorContext`. The engine itself is async only
 * because of database I/O during preload and persistence.
 *
 * Design rationale:
 * - **Pure detectors** are trivial to test (build a synthetic context
 *   literal and assert) and free of N+1 query traps.
 * - **Pre-loaded context** means each detector reads from the same in-memory
 *   snapshot of transactions/budgets/recurring/accounts. If two detectors
 *   need the same expensive aggregation (e.g., "month-by-month spend per
 *   category"), the engine should compute it ONCE and stash it on the
 *   context. We don't pre-compute aggregates here — that's an engine
 *   implementation detail. Detectors that share work just call the same
 *   helper from `lib/analytics/insights/aggregations.ts`.
 *
 * @see ./engine.ts for the orchestration
 * @see ./detectors/ for each detector implementation
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import type { BudgetWithProgress } from '@/lib/queries/budgets';
import type { ActiveRecurring } from '@/lib/queries/recurring';

// ─── Severity ─────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'alert';

// ─── Transaction snapshot ─────────────────────────────────────────────────────

/**
 * Slim transaction shape used by detectors. We deliberately strip noisy
 * columns (raw description, merchant_id) so detectors cannot accidentally
 * read PII into log lines or insight bodies.
 *
 * `baseAmountCents` is the FX-converted amount in the user's base currency,
 * already aligned across rows. Sign convention matches the source table:
 * negative = expense, positive = income/refund. Detectors that care about
 * "how much was spent" should use `Math.abs(baseAmountCents)`.
 */
export interface InsightsTxRow {
  id: string;
  transactionDate: string; // YYYY-MM-DD
  baseAmountCents: bigint;
  currency: string;
  categoryId: string | null;
  /** True when the row is recurring-linked (suspends detection that double-counts). */
  recurringId: string | null;
  /** Merchant name only — never the raw description. */
  merchantName: string | null;
  /** Resolved category name + kind for grouping/skips. */
  categoryName: string | null;
  categoryKind: 'expense' | 'income' | 'transfer' | 'saving' | 'other';
}

// ─── Account snapshot ─────────────────────────────────────────────────────────

export interface InsightsAccountRow {
  id: string;
  name: string;
  currency: string;
  /** ISO 4217 base balance after FX, snapshot at preload time. */
  baseBalanceCents: bigint;
}

// ─── Detector context ─────────────────────────────────────────────────────────

export interface DetectorContext {
  userId: string;
  /** RLS-aware OR service-role; detectors are agnostic but always filter by user_id
   *  upstream (engine preloads data scoped to userId). */
  supabase: Pick<SupabaseClient<Database>, 'from' | 'rpc'>;
  baseCurrency: string;
  /** Injectable for tests. Engine passes `new Date()` at runtime. */
  today: Date;
  /** Last 120 days, non-deleted, non-transfer, non-excluded. */
  transactions: InsightsTxRow[];
  budgets: BudgetWithProgress[];
  recurring: ActiveRecurring[];
  accounts: InsightsAccountRow[];
  /**
   * Set of dedup_keys that already have a live insight for this user.
   * Detectors do NOT need to consult this — the engine filters their
   * output before insert. Exposed here purely for tests that want to
   * assert "this detector skipped X because it's already live".
   */
  liveDedupKeys: ReadonlySet<string>;
}

// ─── Insight emitted by a detector ────────────────────────────────────────────

export interface Insight {
  /** Detector ID, e.g., 'category_anomaly'. Used as the `type` column value. */
  type: string;
  severity: Severity;
  title: string;
  /** Markdown body — light formatting only (bold, links, lists). */
  body: string;
  /** Optional relative URL, e.g., '/budzeti/{id}'. Hardcoded by detector. */
  actionUrl?: string;
  /** Stable per (detector, scope, period_bucket). Engine uses this for dedup. */
  dedupKey: string;
  /** When this insight goes stale. ISO timestamp. */
  validUntil?: Date;
  /** Detector-specific structured data; UI uses for rich detail. */
  metadata?: Record<string, unknown>;
}

// ─── Detector interface ───────────────────────────────────────────────────────

export interface Detector {
  /** Stable ID; matches the `type` column value of every insight emitted. */
  id: string;
  /** Human label for logs (Bosnian copy not required — internal). */
  label: string;
  /** Pure function over context. Engine wraps in try/catch. */
  run: (ctx: DetectorContext) => Insight[];
}

// ─── Engine result ────────────────────────────────────────────────────────────

export interface EngineResult {
  /** Insights successfully inserted into the DB. */
  created: number;
  /** Detector outputs filtered out due to existing live dedup_key. */
  skipped: number;
  /** Detectors that threw (their output ignored, others continue). */
  errored: number;
  /** Per-detector counts, helpful for diagnostics. */
  byDetector: Record<string, { created: number; skipped: number; errored: boolean }>;
}
