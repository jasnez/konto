import {
  BookOpen,
  Camera,
  Coins,
  Home,
  Receipt,
  PieChart,
  PiggyBank,
  Repeat,
  Settings,
  Store,
  Tags,
  Target,
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
    href: '/potrosnja',
    label: 'Potrošnja',
    mobileLabel: 'Potroš.',
    icon: Coins,
    desktopOnly: true,
  },
  { href: '/budzeti', label: 'Budžeti', mobileLabel: 'Budž.', icon: PiggyBank, desktopOnly: true },
  { href: '/ciljevi', label: 'Ciljevi', mobileLabel: 'Cilj.', icon: Target, desktopOnly: true },
  { href: '/pretplate', label: 'Pretplate', mobileLabel: 'Pret.', icon: Repeat, desktopOnly: true },
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
  { href: '/vodic', label: 'Vodič', mobileLabel: 'Vodič', icon: BookOpen, desktopOnly: true },
  { href: '/help', label: 'Pomoć', mobileLabel: 'Pomoć', icon: HelpCircle, desktopOnly: true },
  { href: '/uvidi', label: 'Uvidi', mobileLabel: 'Uvidi', icon: PieChart, desktopOnly: true },
  { href: '/podesavanja', label: 'Podešavanja', mobileLabel: 'Više', icon: Settings },
];

/**
 * Bottom nav direct-link slots on mobile: Početna, Računi | (FAB centre) |
 * Transakcije. The 4th slot is a "Više" overflow Sheet rendered by
 * <BottomNav/> itself (see <MoreNavSheet/>) — it surfaces every NAV_ITEMS
 * route that is not already a direct slot here, so future desktopOnly
 * routes (Budžeti, Pretplate, Skeniraj, Uvoz, Pomoć, Uvidi, …) and
 * Kategorije are reachable on mobile without per-route nav surgery.
 *
 * Why "Više" is not in this array: the Sheet derives its label/icon from
 * the trigger button itself, not from a NavItem entry. Keeping it out of
 * BOTTOM_NAV_ITEMS lets `MoreNavSheet` filter NAV_ITEMS as
 * "everything not in BOTTOM_NAV_ITEMS" without special-casing Podešavanja.
 */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: '/pocetna', label: 'Početna', mobileLabel: 'Početna', icon: Home },
  { href: '/racuni', label: 'Računi', mobileLabel: 'Računi', icon: Wallet },
  // FAB sits here in the middle — rendered by <BottomNav/> itself.
  { href: '/transakcije', label: 'Transakcije', mobileLabel: 'Tx', icon: Receipt },
  // 4th slot = <MoreNavSheet/> overflow Sheet (rendered by <BottomNav/>).
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
