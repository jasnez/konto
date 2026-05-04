/**
 * Top-bar notification bell (F3-E5-T2).
 *
 * Server Component — fetches the active-insight count once per render of
 * the (app) layout. Renders a relative-positioned bell icon with a badge
 * showing the count when > 0. Click navigates to /uvidi.
 *
 * The count is sourced from `countActiveInsights` in `lib/queries/insights.ts`
 * which uses Postgres `head: true` count (no row payload). Negligible cost.
 *
 * If the user is not authenticated (anon, e.g., during a brief signout
 * race) we render a non-clickable placeholder bell with no badge — keeps
 * layout stable.
 */
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { countActiveInsights } from '@/lib/queries/insights';

export async function NotificationBell() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Layout's getUser() guard normally prevents this, but render defensively.
    return null;
  }

  const count = await countActiveInsights(supabase, user.id);
  const showBadge = count > 0;
  const badgeText = count > 9 ? '9+' : String(count);
  const ariaLabel =
    count === 0
      ? 'Uvidi (nema novih)'
      : count === 1
        ? 'Uvidi (1 novi)'
        : `Uvidi (${String(count)} novih)`;

  return (
    <Link
      href="/uvidi"
      aria-label={ariaLabel}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Bell className="h-5 w-5" aria-hidden />
      {showBadge && (
        <span
          aria-hidden
          className="absolute right-1 top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
        >
          {badgeText}
        </span>
      )}
    </Link>
  );
}
