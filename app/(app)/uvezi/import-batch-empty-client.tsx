'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ImportBatchEmptyClient() {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-left sm:px-5">
        <p className="text-base font-medium text-foreground">
          Nismo prepoznali transakcije u ovom izvodu.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Možda je PDF skeniran kao slika, a ne tekst. Probaj drugi PDF, ili dodaj transakcije
          ručno.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" asChild>
          <Link href="/uvezi">Pokušaj s drugim PDF-om</Link>
        </Button>
        <Button type="button" className="min-h-11 w-full sm:w-auto" asChild>
          <Link href="/transakcije/nova">Dodaj transakcije ručno</Link>
        </Button>
      </div>
    </div>
  );
}
