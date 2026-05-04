/**
 * Centralised severity styling for insight UI components.
 *
 * Tailwind classes follow the existing palette in `budgets-widget.tsx`:
 *   - info     → emerald (positive / neutral)
 *   - warning  → amber   (attention)
 *   - alert    → red     (urgent / destructive)
 *
 * Returning a class bundle (not just colours) means the card and the widget
 * can share one source of truth. Edit here, every consumer updates.
 */
import type { InsightSeverity } from '@/lib/queries/insights';

export interface SeverityClasses {
  /** Tiny circular dot used in the dashboard widget (8px). */
  dot: string;
  /** Background pill (e.g., "Hitno"). */
  pill: string;
  /** Card border / left accent ring colour. */
  border: string;
  /** Bosanski label shown to users. */
  label: string;
}

const PALETTE: Record<InsightSeverity, SeverityClasses> = {
  info: {
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/30',
    label: 'Info',
  },
  warning: {
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/30',
    label: 'Upozorenje',
  },
  alert: {
    dot: 'bg-destructive',
    pill: 'bg-destructive/10 text-destructive',
    border: 'border-destructive/40',
    label: 'Hitno',
  },
};

export function severityClasses(severity: InsightSeverity): SeverityClasses {
  return PALETTE[severity];
}

/** Stable list of all severities in display order (urgent first). */
export const SEVERITIES_DISPLAY_ORDER: readonly InsightSeverity[] = [
  'alert',
  'warning',
  'info',
] as const;
