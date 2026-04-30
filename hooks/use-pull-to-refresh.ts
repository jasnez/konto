'use client';

import { useCallback, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  /** Refresh handler invoked when the pull is committed. May be sync or async. */
  onRefresh: () => unknown;
  /** Pixels of pull required to commit a refresh. Default 70. */
  thresholdPx?: number;
  /** Visual cap on the pull distance (resistance). Default 90. */
  maxPullPx?: number;
  /** Cooldown in ms before another pull can fire. Default 700. */
  cooldownMs?: number;
}

interface UsePullToRefreshResult {
  /** Current pull distance in px (0 when idle). Use to render an indicator. */
  pullDistance: number;
  /** True between commit and cooldown end. Use to disable repeat pulls. */
  isRefreshing: boolean;
  /**
   * Spread on the scroll container (the element whose top edge starts the pull).
   * Returns `onTouchStart` / `onTouchMove` / `onTouchEnd`.
   */
  handlers: {
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
    onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
    onTouchEnd: () => void;
  };
}

/**
 * Pull-to-refresh gesture for any scroll container. The gesture only arms when
 * `window.scrollY === 0` (i.e., the user is already at the top), so it
 * doesn't interfere with normal mid-scroll touches.
 *
 * Render an indicator using `pullDistance` (typically 0–`maxPullPx`):
 *
 * ```tsx
 * const { pullDistance, handlers } = usePullToRefresh({ onRefresh: () => router.refresh() });
 * return (
 *   <div {...handlers}>
 *     {pullDistance > 0 && <div>Pull: {pullDistance}px</div>}
 *     ...
 *   </div>
 * );
 * ```
 */
export function usePullToRefresh(opts: UsePullToRefreshOptions): UsePullToRefreshResult {
  const { onRefresh, thresholdPx = 70, maxPullPx = 90, cooldownMs = 700 } = opts;

  const [pullDistance, setPullDistance] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const refreshingRef = useRef(false);

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (typeof window === 'undefined') return;
    if (window.scrollY === 0) {
      startRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }, []);

  const onTouchMove = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      const start = startRef.current;
      if (start === null || refreshingRef.current) return;
      const deltaY = event.touches[0].clientY - start.y;
      const deltaX = event.touches[0].clientX - start.x;
      // Horizontal-vs-vertical dominance: a primarily horizontal gesture
      // (swipe-to-categorize on a row, accidental tap with sideways drift)
      // must not commit pullDistance. Otherwise the indicator state toggles
      // visibly even though the user never intended to refresh.
      if (Math.abs(deltaX) > Math.abs(deltaY)) return;
      if (deltaY > 0) {
        setPullDistance(Math.min(deltaY, maxPullPx));
      }
    },
    [maxPullPx],
  );

  const onTouchEnd = useCallback(() => {
    if (pullDistance > thresholdPx && !refreshingRef.current) {
      refreshingRef.current = true;
      void onRefresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
      }, cooldownMs);
    }
    startRef.current = null;
    setPullDistance(0);
  }, [pullDistance, thresholdPx, cooldownMs, onRefresh]);

  return {
    pullDistance,
    isRefreshing: refreshingRef.current,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
