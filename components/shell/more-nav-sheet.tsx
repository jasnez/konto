'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_ITEMS, NAV_ITEMS, isActive } from './nav-items';

/**
 * Mobile "Više" overflow menu — bottom-anchored Sheet that exposes every
 * NAV_ITEMS route NOT already in BOTTOM_NAV_ITEMS, so future desktopOnly
 * routes (Budžeti, Pretplate, Skeniraj, Uvoz, Pomoć, Uvidi, …) become
 * reachable on mobile without per-route nav surgery.
 *
 * Used by <BottomNav/> as the 4th slot. Replaces the previous direct link
 * to /podesavanja — Podešavanja still appears in this sheet (last item),
 * keeping access intact.
 */
export function MoreNavSheet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const haptic = useHapticFeedback();

  // Keep the sheet in sync with the active route — open Više while on a
  // page that's only reachable through it should mark it as active.
  const moreActive = !BOTTOM_NAV_ITEMS.some((item) => isActive(pathname, item.href));

  // Items: anything in NAV_ITEMS that the bottom nav does not already
  // surface as a direct link. Stable order = NAV_ITEMS insertion order,
  // which is the editor-controlled "intended grouping" order.
  const overflowItems = NAV_ITEMS.filter(
    (item) => !BOTTOM_NAV_ITEMS.some((b) => b.href === item.href),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Više"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => {
            haptic('tap');
          }}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs',
            moreActive
              ? 'font-semibold text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          <span>Više</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Više</SheetTitle>
        </SheetHeader>
        <nav aria-label="Dodatne stranice" className="mt-2 grid gap-1">
          {overflowItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  haptic('tap');
                  // Close the sheet so the user lands cleanly on the new
                  // route without a stale overlay; Next router handles the
                  // navigation in parallel.
                  setOpen(false);
                }}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-md px-3 text-sm transition-colors',
                  active
                    ? 'bg-accent font-semibold text-primary'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
