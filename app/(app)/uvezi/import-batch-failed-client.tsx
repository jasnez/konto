'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { importBatchErrorMessageForUser } from '@/lib/import/import-batch-error-message';
import { rejectImport, retryImportParse, retryImportFinalize } from '@/lib/server/actions/imports';

interface ImportBatchFailedClientProps {
  batchId: string;
  errorMessageRaw: string | null;
}

export function ImportBatchFailedClient({
  batchId,
  errorMessageRaw,
}: ImportBatchFailedClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const userMessage = importBatchErrorMessageForUser(errorMessageRaw);

  function onRetry() {
    startTransition(async () => {
      const isFxFailure = errorMessageRaw === 'fx_unavailable';
      const result = isFxFailure
        ? await retryImportFinalize({ batchId })
        : await retryImportParse({ batchId });

      if (!result.success) {
        let msg = 'Ponovni pokušaj nije uspio.';
        if (result.error === 'VALIDATION_ERROR') {
          msg = result.details._root[0] ?? 'Provjeri podatke.';
        } else if (result.error === 'UNAUTHORIZED') {
          msg = 'Prijavi se ponovo.';
        } else if (result.error === 'NOT_FOUND') {
          msg = 'Uvoz nije pronađen.';
        } else if (result.error === 'BAD_STATE') {
          msg = 'Ovaj uvoz se ne može ponovo obraditi.';
        } else if (result.error === 'RATE_LIMITED') {
          msg = 'Previše pokušaja parsiranja. Pokušaj ponovo za 10 minuta.';
        }
        toast.error(msg);
        return;
      }
      toast.message(
        isFxFailure ? 'Ponovo pokrećem finalizaciju…' : 'Ponovo pokrećem obradu izvoda…',
      );
      router.refresh();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await rejectImport({ batchId });
      if (!result.success) {
        let msg = 'Brisanje nije uspjelo.';
        if (result.error === 'VALIDATION_ERROR') {
          msg = result.details._root[0] ?? 'Provjeri podatke.';
        } else if (result.error === 'UNAUTHORIZED') {
          msg = 'Prijavi se ponovo.';
        } else if (result.error === 'NOT_FOUND') {
          msg = 'Uvoz nije pronađen.';
        } else if (result.error === 'BAD_STATE') {
          msg = 'Ovaj uvoz se ne može obrisati.';
        }
        toast.error(msg);
        return;
      }
      toast.success('Uvoz je uklonjen.');
      router.push('/uvezi');
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-destructive/35 bg-destructive/10 px-4 py-4 text-left sm:px-5">
        <p className="text-base font-medium text-foreground">Uvoz nije uspio</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{userMessage}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          disabled={pending}
          onClick={() => {
            onRetry();
          }}
        >
          Pokušaj ponovo
        </Button>
        <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" asChild>
          <Link href="/transakcije/nova">Ručno unesi transakcije</Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 sm:w-auto"
          disabled={pending}
          onClick={() => {
            onDelete();
          }}
        >
          Obriši import
        </Button>
      </div>
    </div>
  );
}
