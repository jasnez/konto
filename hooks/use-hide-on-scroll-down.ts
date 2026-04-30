'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `true` when the user is scrolling down the document past
 * `revealThresholdPx` (so the caller — typically a sticky header — should
 * translate itself out of viewport). Returns to `false` on any upward scroll
 * or when scrolled near the top.
 *
 * Throttled via `requestAnimationFrame` and a small `deltaPx` deadband so a
 * trembling thumb on a touchscreen doesn't flicker the header. SSR-safe:
 * initial state is `false` (visible), the effect attaches on mount.
 *
 * Designed for mobile auto-hide chrome (P4-B from the mobile UX plan); pair
 * with a viewport guard if the behavior should only apply below `md`.
 */
export function useHideOnScrollDown(opts?: {
  /** Don't auto-hide while scrollY is below this many pixels. Default 64. */
  revealThresholdPx?: number;
  /** Direction must change by at least this many px to flip state. Default 4. */
  deltaPx?: number;
}): boolean {
  const revealThresholdPx = opts?.revealThresholdPx ?? 64;
  const deltaPx = opts?.deltaPx ?? 4;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const y = window.scrollY;
      if (y < revealThresholdPx) {
        setHidden(false);
      } else if (y > lastY + deltaPx) {
        setHidden(true);
      } else if (y < lastY - deltaPx) {
        setHidden(false);
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, [revealThresholdPx, deltaPx]);

  return hidden;
}
