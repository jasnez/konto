'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthSegmentError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('auth_segment_error', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-6 rounded-xl border bg-card p-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">Greška</p>
        <h1 className="text-xl font-semibold tracking-tight">Prijava trenutno ne radi</h1>
        <p className="text-sm text-muted-foreground">
          Pokušaj opet. Ako se nastavi, otvori{' '}
          <Link href="/kontakt" className="text-primary underline-offset-4 hover:underline">
            kontakt
          </Link>{' '}
          stranicu.
        </p>
        {error.digest ? (
          <p className="text-xs font-mono text-muted-foreground">ref: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button onClick={reset} className="min-h-11">
          Pokušaj ponovo
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/">Na početnu</Link>
        </Button>
      </div>
    </section>
  );
}
