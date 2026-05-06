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
  /**
   * When true, the touch listeners are not attached. Used when a parent
   * needs to suppress the gesture (e.g. dashboard edit mode where a
   * top-of-page drag is reordering, not refreshing).
   */
  disabled?: boolean;
}

/**
 * Client-only wrapper that adds a mobile pull-to-refresh gesture to its
 * children. Calls `router.refresh()` when the pull commits, which re-runs
 * the surrounding server component without a full navigation.
 *
 * No visible pull indicator: rendering one as in-flow content shifts the
 * layout on every accidental Y delta (taps, horizontal swipes), making the
 * UI feel like it bounces. The committed-refresh toast already confirms the
 * action; the gesture itself is the only affordance needed.
 */
export function PullToRefreshWrapper({
  children,
  className,
  refreshLabel = 'Osvježavam...',
  disabled = false,
}: PullToRefreshWrapperProps) {
  const router = useRouter();
  const { handlers } = usePullToRefresh({
    onRefresh: () => {
      toast.message(refreshLabel);
      router.refresh();
    },
  });

  return (
    <div className={className} {...(disabled ? {} : handlers)}>
      {children}
    </div>
  );
}
