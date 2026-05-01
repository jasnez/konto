'use client';

import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * Sheet shell that wraps the existing TransactionEditForm when the edit
 * route is reached via soft navigation (intercepted at the @modal slot
 * in app/(app)/layout.tsx).
 *
 * On desktop the sheet slides in from the right at ~36rem so the
 * underlying transaction list / detail page stays visible — the
 * audit-N17 complaint that "edit hides the list during edit" goes away.
 *
 * On mobile, side="right" + w-full collapses into a full-width slide-in
 * that visually behaves the same as the original full-page route.
 *
 * Closing the sheet — via Escape, click-outside, or the built-in close
 * button — calls router.back(), which dismisses the modal AND restores
 * the previous URL (e.g. /transakcije/[id]). Direct URL hits don't reach
 * this shell (they get the full page route below).
 */
export function TransactionEditModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) router.back();
      }}
    >
      <SheetContent
        side="right"
        // Wider than the default sheet (which is sm:max-w-sm) — edit
        // forms have many fields and benefit from breathing room. On
        // mobile w-full takes over so layout still fills the screen.
        className="w-full overflow-y-auto sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Uredi transakciju</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
