/**
 * Bosnian display labels for the 6 detector types. Filter chips on /uvidi
 * render these strings; insight cards use them as a small "kind" label.
 *
 * Keep label length compact — chips wrap on mobile.
 */
import type { InsightType } from '@/lib/queries/insights';

const LABELS: Record<InsightType, string> = {
  category_anomaly: 'Anomalija kategorije',
  savings_opportunity: 'Ušteda',
  unusual_transaction: 'Neobična transakcija',
  subscription_price_change: 'Promjena cijene',
  dormant_subscription: 'Neaktivna pretplata',
  budget_breach: 'Prijetnja budžetu',
};

export function typeLabel(type: InsightType): string {
  return LABELS[type];
}

/** Stable list of all types (used to render filter chips in fixed order). */
export const TYPES_DISPLAY_ORDER: readonly InsightType[] = [
  'category_anomaly',
  'savings_opportunity',
  'unusual_transaction',
  'subscription_price_change',
  'dormant_subscription',
  'budget_breach',
] as const;
