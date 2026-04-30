'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_ITEMS, isActive } from './nav-items';
import { MobileFab } from './fab';

/**
 * Fixed bottom navigation for mobile. 5 inline slots: 2 nav links | FAB |
 * 2 nav links — symmetric layout, FAB sits flush inside the bar (no
 * floating overlay) so it stops "sticking out" of the chrome. Includes
 * iOS/Android safe-area padding and is hidden on md+ screens where the
 * sidebar takes over.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [leftItems, rightItems] = [BOTTOM_NAV_ITEMS.slice(0, 2), BOTTOM_NAV_ITEMS.slice(2)];

  return (
    <nav
      aria-label="Glavna navigacija"
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-stretch border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      {leftItems.map((item) => (
        <NavSlot key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="flex flex-1 items-center justify-center">
        <MobileFab />
      </div>
      {rightItems.map((item) => (
        <NavSlot key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
    </nav>
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
