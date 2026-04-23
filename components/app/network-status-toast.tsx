'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const OFFLINE_MSG = 'Nema mrežne veze. Provjeri internet pa pokušaj opet.';

/**
 * Prikazuje toast na offline/online; ne hvata mrežne greške pojedinačnih requesta
 * (to rade stranice i error granica).
 */
export function NetworkStatusToast() {
  const prevOnline = useRef(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const onOnline = () => {
      if (!prevOnline.current) {
        toast.success('Ponovo si na mreži.');
      }
      prevOnline.current = true;
    };
    const onOffline = () => {
      prevOnline.current = false;
      toast.error(OFFLINE_MSG, { duration: 6_000 });
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      onOffline();
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return null;
}
