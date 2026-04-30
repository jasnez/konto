'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

interface PullToRefreshWrapperProps {
  children: ReactNode;
  className?: string;
  /** Toast message shown while the refresh is in flight. */
  refreshLabel?: string;
}

/**
 * Client-only wrapper that adds a mobile pull-to-refresh gesture to its
 * children. Calls `router.refresh()` when the pull commits, which re-runs
 * the surrounding server component without a full navigation.
 *
 * Usage in a server component:
 * ```tsx
 * <PullToRefreshWrapper className="mx-auto w-full max-w-6xl ...">
 *   {children}
 * </PullToRefreshWrapper>
 * ```
 *
 * The pull indicator uses the existing visual pattern (small muted text above
 * the content, "Povuci dole za refresh" → "Pusti za osvježavanje" past the
 * threshold).
 */
export function PullToRefreshWrapper({
  children,
  className,
  refreshLabel = 'Osvježavam...',
}: PullToRefreshWrapperProps) {
  const router = useRouter();
  const { pullDistance, handlers } = usePullToRefresh({
    onRefresh: () => {
      toast.message(refreshLabel);
      router.refresh();
    },
  });

  return (
    <div className={className} {...handlers}>
      {pullDistance > 0 ? (
        <div className="mb-2 text-center text-xs text-muted-foreground">
          {pullDistance > 70 ? 'Pusti za osvježavanje' : 'Povuci dole za refresh'}
        </div>
      ) : null}
      {children}
    </div>
  );
}
