'use client';

import { useEffect, useState } from 'react';
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

export default function Error({ error, reset }: ErrorProps) {
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
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">{network ? 'Mreža' : 'Greška'}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {network ? 'Nema mrežne veze' : 'Nešto nije u redu'}
        </h1>
        <p className="text-muted-foreground">
          {network
            ? 'Provjeri Wi‑Fi ili mobilne podatke, pa osvježi stranicu.'
            : 'Pokušaj ponovo za trenutak. Ako se ponavlja, javi se podršci.'}
        </p>
      </div>
      <Button onClick={reset} className="min-h-11 min-w-[44px]">
        {network ? 'Pokušaj opet' : 'Pokušaj ponovo'}
      </Button>
    </main>
  );
}
