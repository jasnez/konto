'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-mono text-muted-foreground">Greška</p>
        <h1 className="text-2xl font-semibold tracking-tight">Nešto nije u redu</h1>
        <p className="text-muted-foreground">Pokušaj ponovo za trenutak.</p>
      </div>
      <Button onClick={reset}>Pokušaj ponovo</Button>
    </main>
  );
}
