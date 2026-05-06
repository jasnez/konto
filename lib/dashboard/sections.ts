/**
 * Dashboard widget registry. Each key here corresponds to one widget in
 * the SortableDashboard slot map. The user can reorder these and toggle
 * their visibility through the "Preuredi" edit mode.
 *
 * Adding a new widget:
 *   1. Append the key here (NOT in DEFAULT_VISIBLE_ORDER unless you want
 *      every existing user to see it on their next visit — usually you
 *      don't, since they may have already customized).
 *   2. Add a label below.
 *   3. Render it in the slot map in app/(app)/pocetna/page.tsx.
 *
 * The widget shows up automatically in the "Hidden sections" tray in
 * edit mode for any user whose stored order doesn't include it.
 */

export const DASHBOARD_SECTION_KEYS = [
  'hero',
  'donut',
  'forecast',
  'budgets',
  'insights',
  'recent_tx',
  'metrics',
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

/**
 * Order shown to a user with `profiles.dashboard_section_order = NULL`.
 * Excludes `metrics` (4 KPI cards) — they ship hidden by default; the
 * user can opt in via the "Skrivene sekcije" tray in edit mode.
 */
export const DEFAULT_VISIBLE_ORDER: DashboardSectionKey[] = [
  'hero',
  'donut',
  'forecast',
  'budgets',
  'insights',
  'recent_tx',
];

export const SECTION_LABELS_BS: Record<DashboardSectionKey, string> = {
  hero: 'Neto stanje',
  donut: 'Potrošnja po kategorijama',
  forecast: 'Projekcija',
  budgets: 'Budžeti',
  insights: 'Uvidi',
  recent_tx: 'Zadnje transakcije',
  metrics: 'Mjesečni pregled (KPI kartice)',
};

const KNOWN_KEYS = new Set<string>(DASHBOARD_SECTION_KEYS);

/**
 * Parse the JSONB column into a clean ordered list of visible section keys.
 *
 * - NULL or non-object: user hasn't customized — return DEFAULT_VISIBLE_ORDER.
 * - `{ "order": <not-array> }`: malformed wrapper — return defaults (fail safe).
 * - `{ "order": [] }`: user explicitly saved "everything hidden" — return [].
 * - `{ "order": [...] }`: filter to known keys and dedupe; return what remains
 *   (may be empty if the user only had unknown/dropped keys, which is treated
 *   as the same explicit "everything hidden" state).
 *
 * A corrupted row should never make the dashboard unusable, hence the fallback
 * to defaults for shapes that don't match the contract at all.
 */
export function resolveSectionOrder(raw: unknown): DashboardSectionKey[] {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_VISIBLE_ORDER;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.order)) return DEFAULT_VISIBLE_ORDER;
  const seen = new Set<DashboardSectionKey>();
  const out: DashboardSectionKey[] = [];
  for (const key of obj.order) {
    if (typeof key !== 'string') continue;
    if (!KNOWN_KEYS.has(key)) continue;
    const k = key as DashboardSectionKey;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
