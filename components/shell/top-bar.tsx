'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getPageTitleForPath } from './nav-items';

/**
 * Sticky top bar used by the (app) layout. Desktop shows the page title left
 * and an optional actions slot right. Mobile shows a compact header with the
 * Konto brand and the title underneath; primary nav lives in the bottom nav.
 */
export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitleForPath(pathname);

  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex flex-1 items-center gap-3">
        <Link
          href="/pocetna"
          className="text-base font-semibold tracking-tight md:hidden"
          aria-label="Konto"
        >
          Konto
        </Link>
        <h1 className="hidden text-lg font-semibold tracking-tight md:block">{title}</h1>
        <span className="text-sm text-muted-foreground md:hidden" aria-hidden>
          · {title}
        </span>
      </div>
    </header>
  );
}
