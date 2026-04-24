'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ImportBatchEmptyClient() {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-left sm:px-5">
        <p className="text-base font-medium text-foreground">
          AI nije pronašao transakcije u ovom izvodu.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ako misliš da bi trebalo imati stavke, pokušaj s drugim PDF-om ili unesi ih ručno.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" asChild>
          <Link href="/import">Pokušaj ponovo s drugim PDF-om</Link>
        </Button>
        <Button type="button" className="min-h-11 w-full sm:w-auto" asChild>
          <Link href="/transakcije/nova">Ručno unesi transakcije</Link>
        </Button>
      </div>
    </div>
  );
}
