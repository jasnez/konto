'use client';

import { useEffect } from 'react';

/**
 * Registers `/sw.js` on the client. Intentionally production-only:
 *
 *  • In dev, Next.js rebuilds assets constantly and a cache-first SW makes
 *    it look like changes are not applying. Easier to skip altogether.
 *  • In production, we register once on mount. The browser handles updates
 *    (byte-diff on sw.js forces a reinstall + new cache version).
 *
 * Renders nothing.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('sw_register_failed', error);
    });
  }, []);

  return null;
}
