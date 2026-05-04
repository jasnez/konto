/**
 * Insights read-side query helpers (F3-E5-T2).
 *
 * The engine writes to `public.insights` via service-role; users read their
 * own rows via these helpers (RLS scopes everything by `auth.uid()`).
 *
 * Two consumers:
 *   - `/uvidi` page — wants up to ~100 active OR archived rows, sorted
 *     severity-first then created_at-DESC.
 *   - Dashboard widget — wants top 3 active by recency.
 *   - TopBar bell — wants only the count of active insights.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

export type InsightsSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

export type InsightSeverity = 'info' | 'warning' | 'alert';

/** All detector IDs in the system. Keep in sync with `lib/analytics/insights/detectors/`. */
export type InsightType =
  | 'category_anomaly'
  | 'savings_opportunity'
  | 'unusual_transaction'
  | 'subscription_price_change'
  | 'dormant_subscription'
  | 'budget_breach';

const KNOWN_TYPES: ReadonlySet<string> = new Set<InsightType>([
  'category_anomaly',
  'savings_opportunity',
  'unusual_transaction',
  'subscription_price_change',
  'dormant_subscription',
  'budget_breach',
]);

const KNOWN_SEVERITIES: ReadonlySet<string> = new Set<InsightSeverity>([
  'info',
  'warning',
  'alert',
]);

/**
 * Severity rank (higher = more urgent). We sort active insights with
 * `alert` first so the most pressing items surface to the top.
 */
const SEVERITY_RANK: Record<InsightSeverity, number> = {
  alert: 3,
  warning: 2,
  info: 1,
};

/** Row shape returned to the UI — type-narrowed and camelCased. */
export interface InsightRow {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  body: string;
  actionUrl: string | null;
  metadata: Record<string, unknown>;
  validUntil: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

/** Raw row shape from the DB (snake_case + free-text columns). */
interface InsightRowRaw {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  valid_until: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface ListInsightsOptions {
  mode: 'active' | 'archived';
  /** Hard cap on rows fetched. Default 100 for /uvidi, widget passes 3. */
  limit?: number;
  /** Injectable for tests; defaults to `new Date()`. */
  now?: Date;
}

const DEFAULT_LIMIT = 100;

/**
 * Coerces an unknown string to a known InsightType, or to `null` if it's
 * something we don't recognise. Defensive against future detector IDs that
 * weren't released alongside this code.
 */
function asKnownType(s: string): InsightType | null {
  return KNOWN_TYPES.has(s) ? (s as InsightType) : null;
}

function asKnownSeverity(s: string): InsightSeverity | null {
  return KNOWN_SEVERITIES.has(s) ? (s as InsightSeverity) : null;
}

/**
 * Lists insights for a user, filtered by mode.
 *
 * - `mode: 'active'`  → not dismissed AND (valid_until null OR > now).
 * - `mode: 'archived'` → dismissed (regardless of valid_until — once dismissed,
 *    we keep showing in archive until the cleanup cron sweeps it).
 *
 * Active list is sorted `severity DESC` then `created_at DESC` in memory
 * (Postgres can't natively rank text severity without a CASE expression and
 * the row count is small). Archived list is sorted `dismissed_at DESC`.
 *
 * Rows whose type or severity don't match known values are dropped (defensive
 * — happens only if the DB diverges from this code, e.g. a future detector ID).
 */
export async function listInsights(
  supabase: InsightsSupabaseClient,
  userId: string,
  options: ListInsightsOptions,
): Promise<InsightRow[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  let q = supabase
    .from('insights')
    .select(
      'id, type, severity, title, body, action_url, metadata, valid_until, dismissed_at, created_at',
    )
    .eq('user_id', userId)
    .limit(limit);

  if (options.mode === 'active') {
    q = q
      .is('dismissed_at', null)
      .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
      // Order is stable across UI tabs; we re-sort severity-first below.
      .order('created_at', { ascending: false });
  } else {
    q = q.not('dismissed_at', 'is', null).order('dismissed_at', { ascending: false });
  }

  const { data, error } = await q;
  if (error) {
    logSafe('list_insights_select', { userId, mode: options.mode, error: error.message });
    return [];
  }

  const rows = (data as InsightRowRaw[]).flatMap((r) => {
    const type = asKnownType(r.type);
    const severity = asKnownSeverity(r.severity);
    if (type === null || severity === null) return [];
    return [
      {
        id: r.id,
        type,
        severity,
        title: r.title,
        body: r.body,
        actionUrl: r.action_url,
        metadata: r.metadata ?? {},
        validUntil: r.valid_until,
        dismissedAt: r.dismissed_at,
        createdAt: r.created_at,
      },
    ];
  });

  if (options.mode === 'active') {
    rows.sort((a, b) => {
      const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sevDiff !== 0) return sevDiff;
      // Both already ordered by created_at DESC server-side; tiebreak preserves
      // that — newer first.
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  return rows;
}

/**
 * Returns just the count of active (non-dismissed, non-expired) insights for
 * the user. Used by the TopBar notification bell badge.
 *
 * Uses Postgres's HEAD COUNT for efficiency — no row payload transferred.
 */
export async function countActiveInsights(
  supabase: InsightsSupabaseClient,
  userId: string,
  options: { now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const { count, error } = await supabase
    .from('insights')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`);

  if (error) {
    logSafe('count_active_insights_error', { userId, error: error.message });
    return 0;
  }
  return count ?? 0;
}
