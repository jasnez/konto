'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Pill-shaped interactive element used for filters, type-segmented controls,
 * and removable tags. Distinct from `Button` (CTA semantics) and `Badge`
 * (read-only display).
 *
 * @see docs/03-design-system.md
 */
const chipVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Inactive selectable chip (e.g., a category in the filter sheet).
        default: 'border-input bg-background text-foreground hover:bg-accent',
        // Currently-selected chip (e.g., active type filter).
        active: 'border-primary bg-primary text-primary-foreground',
        // Removable badge-style chip (e.g., active-filter strip with × icon).
        removable:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
      },
      size: {
        // Default chip — matches `Button` size sm height for visual consistency.
        default: 'h-9 min-h-9 px-3 text-xs',
        // Compact chip — used in active-filter strips where vertical space matters.
        sm: 'h-7 px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ChipProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
    VariantProps<typeof chipVariants> {
  /**
   * Convenience shorthand for selectable chips:
   *   - `<Chip active={true}>` → `variant: 'active'` (primary fill)
   *   - `<Chip variant="default" active={true}>` → `variant: 'active'`
   *   - `<Chip variant="active" active={false}>` → `variant: 'active'` (explicit wins)
   *   - `<Chip variant="removable">` → `variant: 'removable'` (active is no-op)
   *
   * For non-default variants (`removable`), `active` is intentionally ignored —
   * removable chips don't have an active state. If you need an "active removable"
   * visual, add a new variant rather than combining.
   */
  active?: boolean;
  /** Defaults to `"button"` so callers don't accidentally submit forms. */
  type?: 'button' | 'submit' | 'reset';
}

type ChipVariant = NonNullable<VariantProps<typeof chipVariants>['variant']>;

/**
 * Resolves the visual variant from explicit `variant` + `active` shorthand.
 * Rules: explicit non-default `variant` wins; otherwise `active` selects between
 * `'active'` and `'default'`.
 */
function resolveVariant(variant: ChipVariant | null | undefined, active: boolean): ChipVariant {
  if (variant && variant !== 'default') return variant;
  if (active) return 'active';
  return variant ?? 'default';
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, variant, size, active = false, type = 'button', ...props }, ref) => {
    const resolved = resolveVariant(variant, active);
    return (
      <button
        ref={ref}
        type={type}
        className={cn(chipVariants({ variant: resolved, size }), className)}
        {...props}
      />
    );
  },
);
Chip.displayName = 'Chip';

export { Chip, chipVariants };
