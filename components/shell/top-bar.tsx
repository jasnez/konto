'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useHideOnScrollDown } from '@/hooks/use-hide-on-scroll-down';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { cn } from '@/lib/utils';
import { getPageTitleForPath } from './nav-items';

export interface TopBarProps {
  /**
   * Optional right-side action slot. Server Components are accepted (e.g.
   * <NotificationBell />), since Client Components can render Server
   * Component children passed in via props.
   */
  rightSlot?: ReactNode;
}

/**
 * Sticky top bar used by the (app) layout. Desktop shows the page title left
 * and an optional actions slot right. Mobile shows a compact header with the
 * Konto brand and the title underneath; primary nav lives in the bottom nav.
 *
 * Auto-hide on mobile only: scrolls out of viewport on scroll-down past 64px,
 * back in on scroll-up. Reclaims ~56px while reading lists. Disabled on
 * desktop (md+) where the bar is part of the chrome and doesn't compete for
 * vertical space the same way.
 */
export function TopBar({ rightSlot }: TopBarProps = {}) {
  const pathname = usePathname();
  const title = getPageTitleForPath(pathname);
  const isMobile = useIsMobile();
  const hidden = useHideOnScrollDown();
  const shouldHide = isMobile && hidden;

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-16 items-center border-b bg-background/80 px-4 backdrop-blur-sm transition-transform duration-200 ease-out sm:px-6',
        shouldHide && '-translate-y-full',
      )}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      data-hidden={shouldHide ? 'true' : 'false'}
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
      {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
    </header>
  );
}
