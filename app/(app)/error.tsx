'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

function isLikelyNetworkError(err: Error): boolean {
  const m = err.message.toLowerCase();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return (
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('connection')
  );
}

export default function AppSegmentError({ error, reset }: ErrorProps) {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const network = offline || isLikelyNetworkError(error);

  useEffect(() => {
    const onOff = () => {
      setOffline(!navigator.onLine);
    };
    window.addEventListener('online', onOff);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online', onOff);
      window.removeEventListener('offline', onOff);
    };
  }, []);

  useEffect(() => {
    console.error('app_segment_error', {
      digest: error.digest,
      message: error.message,
    });
    // PR-2: forward to Sentry. No-op without NEXT_PUBLIC_SENTRY_DSN.
    Sentry.captureException(error, {
      tags: { boundary: 'app' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">{network ? 'Mreža' : 'Greška'}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {network ? 'Nema mrežne veze' : 'Ovaj dio aplikacije trenutno ne radi'}
        </h1>
        <p className="text-muted-foreground">
          {network
            ? 'Provjeri Wi‑Fi ili mobilne podatke, pa pokušaj opet.'
            : 'Pokušaj osvježiti ovu stranicu. Ostatak aplikacije je i dalje dostupan u meniju.'}
        </p>
        {error.digest ? (
          <p className="text-xs font-mono text-muted-foreground">ref: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset} className="min-h-11 min-w-[44px]">
        Pokušaj ponovo
      </Button>
    </section>
  );
}
