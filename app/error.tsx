'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

function classifyError(err: Error): {
  type: 'network' | 'auth' | 'server' | 'unknown';
  label: string;
  title: string;
  message: string;
} {
  const m = err.message.toLowerCase();

  if (m.includes('unauthorized') || m.includes('401')) {
    return {
      type: 'auth',
      label: 'Pristup odbijen',
      title: 'Trebam da se prijaviš',
      message: 'Tvoja sesija je istekla. Prijavi se ponovo da bi nastavio rad sa Kontom.',
    };
  }

  if (m.includes('service_unavailable') || m.includes('503')) {
    return {
      type: 'server',
      label: 'Servis nedostupan',
      title: 'Privremeno nedostupan',
      message: 'Naš servis je privremeno nedostupan. Pokušaj opet za par minuta.',
    };
  }

  if (m.includes('server') || m.includes('500') || m.includes('internal error')) {
    return {
      type: 'server',
      label: 'Greška servera',
      title: 'Nešto nije u redu na našoj strani',
      message: 'Naš tim je obaviješten o problemu. Pokušaj ponovo ili nas kontaktiraj za pomoć.',
    };
  }

  if (isLikelyNetworkError(err)) {
    return {
      type: 'network',
      label: 'Mreža',
      title: 'Nema mrežne veze',
      message: 'Provjeri Wi‑Fi ili mobilne podatke, pa osvježi stranicu.',
    };
  }

  return {
    type: 'unknown',
    label: 'Greška',
    title: 'Nešto nije u redu',
    message: 'Pokušaj ponovo za trenutak. Ako se problem ponavlja, javi se podršci.',
  };
}

export default function Error({ error, reset }: ErrorProps) {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const isOffline = offline || isLikelyNetworkError(error);
  const classification = classifyError(error);

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
    console.error('[ErrorBoundary]', {
      digest: error.digest,
      message: error.message,
      type: classification.type,
    });
    // PR-2: forward to Sentry for grouping + breadcrumbs. No-op without
    // NEXT_PUBLIC_SENTRY_DSN. PII scrubbed in beforeSend (sentry-scrub.ts).
    Sentry.captureException(error, {
      tags: { boundary: 'root', errorType: classification.type },
      extra: { digest: error.digest },
    });
  }, [error, classification]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">{classification.label}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{classification.title}</h1>
        <p className="text-muted-foreground max-w-sm">{classification.message}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {isOffline ? (
          <Button onClick={reset} className="min-h-11 min-w-[44px]">
            Osvježi stranicu
          </Button>
        ) : (
          <>
            <Button onClick={reset} variant="default" className="min-h-11 min-w-[44px]">
              Pokušaj ponovo
            </Button>
            <Link href="/pocetna">
              <Button variant="outline" className="min-h-11 min-w-[44px]">
                Početna
              </Button>
            </Link>
          </>
        )}
      </div>

      {error.digest && (
        <p className="text-xs text-muted-foreground font-mono">ID: {error.digest}</p>
      )}
    </main>
  );
}
