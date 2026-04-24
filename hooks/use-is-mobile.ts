'use client';

import { useEffect, useState } from 'react';

// Tailwind's `md` is 768px — anything below that is "mobile" for layout
// decisions (Dialog vs Sheet, desktop reorder affordance, etc.). Keep as a
// named constant so sites that need a different cutoff can opt in rather
// than hardcoding magic numbers.
export const MOBILE_BREAKPOINT_PX = 768;

function query(maxWidthPx: number): string {
  return `(max-width: ${String(maxWidthPx - 1)}px)`;
}

function initialMatch(maxWidthPx: number): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query(maxWidthPx)).matches;
}

/**
 * Reactive mobile-breakpoint check.
 *
 * SSR returns `false` (desktop) on first paint. On the client, initial state
 * is seeded synchronously from `matchMedia` so real mobile users don't flash
 * the desktop layout before the effect runs — specifically this avoids opening
 * the wrong host (Dialog vs Sheet) for a few ms in quick-add.
 */
export function useIsMobile(maxWidthPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => initialMatch(maxWidthPx));

  useEffect(() => {
    const media = window.matchMedia(query(maxWidthPx));
    const onChange = () => {
      setIsMobile(media.matches);
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [maxWidthPx]);

  return isMobile;
}
