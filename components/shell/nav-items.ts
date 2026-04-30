import {
  Camera,
  Home,
  Receipt,
  PieChart,
  MoreHorizontal,
  Settings,
  Store,
  Tags,
  Wallet,
  CreditCard,
  FileUp,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
  /** Hidden from the bottom nav on mobile (desktop sidebar only). */
  desktopOnly?: boolean;
}

/**
 * Single source of truth for sidebar, bottom nav, and top-bar title lookup.
 * Adding a route to /podesavanja/* or /transakcije/* still lights up the
 * correct item because the match uses a `startsWith` prefix check.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/pocetna', label: 'Početna', mobileLabel: 'Početna', icon: Home },
  { href: '/racuni', label: 'Računi', mobileLabel: 'Računi', icon: Wallet },
  { href: '/kategorije', label: 'Kategorije', mobileLabel: 'Kat.', icon: Tags },
  { href: '/merchants', label: 'Prodavači', mobileLabel: 'Shop', icon: Store, desktopOnly: true },
  {
    href: '/kartice-rate',
    label: 'Kartice na rate',
    mobileLabel: 'Rate',
    icon: CreditCard,
    desktopOnly: true,
  },
  { href: '/transakcije', label: 'Transakcije', mobileLabel: 'Transakcije', icon: Receipt },
  {
    href: '/skeniraj',
    label: 'Skeniraj račun',
    mobileLabel: 'Skeniraj',
    icon: Camera,
    desktopOnly: true,
  },
  {
    href: '/import',
    label: 'Uvezi izvod',
    mobileLabel: 'Uvoz',
    icon: FileUp,
    desktopOnly: true,
  },
  { href: '/help', label: 'Pomoć', mobileLabel: 'Pomoć', icon: HelpCircle, desktopOnly: true },
  { href: '/uvidi', label: 'Uvidi', mobileLabel: 'Uvidi', icon: PieChart, desktopOnly: true },
  { href: '/podesavanja', label: 'Podešavanja', mobileLabel: 'Više', icon: Settings },
];

/**
 * On mobile, the bottom nav has exactly 4 link slots — Početna, Računi |
 * (FAB centre) | Transakcije, Više — plus the FAB rendered as the 5th slot
 * by <BottomNav/> itself. Kategorije is intentionally not in the mobile nav
 * (less daily-frequency than Transakcije / Računi); it remains reachable
 * via the desktop sidebar and direct URL.
 */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/pocetna', label: 'Početna', mobileLabel: 'Početna', icon: Home },
  { href: '/racuni', label: 'Računi', mobileLabel: 'Računi', icon: Wallet },
  // FAB sits here in the middle — rendered by <BottomNav/> itself.
  { href: '/transakcije', label: 'Transakcije', mobileLabel: 'Tx', icon: Receipt },
  { href: '/podesavanja', label: 'Više', mobileLabel: 'Više', icon: MoreHorizontal },
];

export function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function getPageTitleForPath(pathname: string): string {
  if (pathname === '/sigurnost' || pathname.startsWith('/sigurnost/'))
    return 'Sigurnost i privatnost';
  const match = NAV_ITEMS.find((item) => isActive(pathname, item.href));
  return match?.label ?? 'Konto';
}
