'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores/ui';

export function TransactionNovaClient() {
  const openQuickAdd = useUiStore((s) => s.openQuickAdd);

  useEffect(() => {
    openQuickAdd();
  }, [openQuickAdd]);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Nova transakcija</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Otvorili smo formu za unos. Ako je ne vidiš, pritisni &quot;Otvori formu&quot; ili
        &quot;Dodaj&quot; u izborniku.
      </p>
      <div className="flex flex-col gap-3 sm:mx-auto sm:max-w-xs">
        <Button
          type="button"
          className="min-h-11 w-full"
          onClick={() => {
            openQuickAdd();
          }}
        >
          Otvori formu
        </Button>
        <Button type="button" variant="outline" className="min-h-11 w-full" asChild>
          <Link href="/transakcije">Natrag na transakcije</Link>
        </Button>
      </div>
    </div>
  );
}
