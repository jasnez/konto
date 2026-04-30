'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_ITEMS, isActive } from './nav-items';
import { MobileFab } from './fab';

/**
 * Fixed bottom navigation for mobile. The FAB floats above the bar in the
 * centre slot; the nav items split 2 + FAB + 2. Includes iOS/Android safe-area
 * padding and is hidden on md+ screens where the sidebar takes over.
 */
export function BottomNav() {
  const pathname = usePathname();

  /** 2 items left of FAB, 3 right (Kategorije, Transakcije, Više). */
  const [leftItems, rightItems] = [BOTTOM_NAV_ITEMS.slice(0, 2), BOTTOM_NAV_ITEMS.slice(2)];

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="mb-4">
          <MobileFab />
        </div>
      </div>

      <nav
        aria-label="Glavna navigacija"
        className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-stretch border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:hidden"
      >
        {leftItems.map((item) => (
          <NavSlot key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="flex-1" aria-hidden />
        {rightItems.map((item) => (
          <NavSlot key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
    </>
  );
}

function NavSlot({ item, active }: { item: (typeof BOTTOM_NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon;
  const haptic = useHapticFeedback();
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        // Soft tap on every nav switch — no-op on iOS Safari / desktop where
        // the Vibration API is unsupported, no-op when prefers-reduced-motion.
        haptic('tap');
      }}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs',
        active ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span>{item.mobileLabel}</span>
    </Link>
  );
}
