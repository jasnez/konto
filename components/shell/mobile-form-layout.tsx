import { cn } from '@/lib/utils';

interface MobileFormLayoutProps {
  /** Form fields, headers, descriptions — anything that scrolls. */
  children: React.ReactNode;
  /** Sticky action bar pinned above the bottom-nav. Usually `<Button type="submit">` etc. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Layout primitive for mobile-first forms in the (app) shell. Solves two
 * recurring problems at once:
 *
 *   1. **Focus-ring clipping (B2):** Tailwind's `focus-visible:ring-2
 *      ring-offset-2` extends ~4px outside the input. When the scroll
 *      container is flush with the input's left edge AND has overflow-y-auto
 *      (which CSS spec forces overflow-x to compute as auto), that left ring
 *      pixel gets clipped. The inner `px-1` here gives the ring room.
 *
 *   2. **Submit button hidden behind bottom-nav (B1):** plain forms place
 *      their submit at document end, where the fixed bottom-nav (z-30,
 *      ~64px tall) covers it. The sticky `<footer>` here sits in the
 *      document, above the nav (z-40), and respects safe-area-inset-bottom.
 *
 * Use:
 *
 *     <MobileFormLayout
 *       action={<Button type="submit">Sačuvaj</Button>}
 *     >
 *       {fields}
 *     </MobileFormLayout>
 */
export function MobileFormLayout({ children, action, className }: MobileFormLayoutProps) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-1 sm:space-y-3">{children}</div>
      </div>
      {action ? (
        <div className="sticky bottom-0 z-40 mt-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          {action}
        </div>
      ) : null}
    </div>
  );
}
