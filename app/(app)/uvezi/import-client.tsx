'use client';

import { FileText, Loader2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ChangeEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { AccountSelect, type AccountOption } from '@/components/account-select';
import { uploadStatement, type UploadStatementResult } from '@/lib/server/actions/imports';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024;
const PDF_MIME = 'application/pdf';

function defaultAccountId(accounts: AccountOption[]): string {
  return accounts.at(0)?.id ?? '';
}

function formatFileSizeBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function translateResult(result: UploadStatementResult): string {
  if (result.success) return '';
  switch (result.error) {
    case 'UNAUTHORIZED':
      return 'Prijavi se da nastaviš.';
    case 'NOT_FOUND':
      return 'Račun nije pronađen.';
    case 'STORAGE_ERROR':
      return 'Greška pri uploadu PDF-a. Pokušaj ponovo.';
    case 'DATABASE_ERROR':
      return 'Baza trenutno nije dostupna. Pokušaj za minut.';
    case 'DUPLICATE':
      return 'Ovaj izvod je već uvezen.';
    case 'RATE_LIMITED':
      return 'Dnevni limit uploada je dostignut. Pokušaj sutra.';
    case 'VALIDATION_ERROR':
      return result.details._root[0] ?? 'Podaci nisu validni.';
    default:
      return 'Nešto nije u redu. Pokušaj ponovo.';
  }
}

interface ImportStatementClientProps {
  accounts: AccountOption[];
}

export function ImportStatementClient({ accounts }: ImportStatementClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState<string>(defaultAccountId(accounts));
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  function validateAndSet(next: File) {
    if (next.type !== PDF_MIME) {
      toast.error('Samo PDF je dozvoljen.');
      return;
    }
    if (next.size > MAX_BYTES) {
      toast.error('Fajl je veći od 10 MB.');
      return;
    }
    if (next.size === 0) {
      toast.error('Fajl je prazan.');
      return;
    }
    setFile(next);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    e.target.value = '';
    if (next) validateAndSet(next);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const next = e.dataTransfer.files.item(0);
    if (next) validateAndSet(next);
  }

  function clearFile() {
    setFile(null);
  }

  function submit() {
    if (!accountId) {
      toast.error('Odaberi račun.');
      return;
    }
    if (!file) {
      toast.error('Odaberi PDF fajl.');
      return;
    }

    const fd = new FormData();
    fd.set('accountId', accountId);
    fd.set('file', file);

    startTransition(async () => {
      const result = await uploadStatement(fd);
      if (result.success) {
        router.push(`/import/${result.data.batchId}`);
        return;
      }
      if (result.error === 'DUPLICATE' && result.batchId) {
        toast.info(translateResult(result), { duration: 5000 });
        router.push(`/import/${result.batchId}`);
        return;
      }
      toast.error(translateResult(result));
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <h2 className="text-base font-semibold">PDF izvod</h2>
        <p className="text-sm text-muted-foreground">
          Fajl ostaje u oblaku privremeno; poslije uvođenja transakcija očekujte automatsko
          brisanje.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="import-account" className="text-base">
            Račun
          </Label>
          <AccountSelect
            id="import-account"
            value={accountId}
            onValueChange={setAccountId}
            accounts={accounts}
            disabled={isPending}
          />
        </div>

        <div>
          <input
            id="import-pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={onInputChange}
            disabled={isPending}
            aria-label="Odaberi PDF fajl"
          />

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (isPending) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('import-pdf')?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
            onClick={() => {
              if (!isPending) document.getElementById('import-pdf')?.click();
            }}
            className={cn(
              'relative min-h-48 w-full cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors md:min-h-56',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 bg-card',
              isPending && 'pointer-events-none cursor-wait opacity-80',
            )}
            aria-busy={isPending}
            aria-label="Zona za prevlačenje PDF fajla"
          >
            <div className="flex flex-col items-center gap-3 py-2">
              {isPending ? (
                <>
                  <Loader2 className="h-12 w-12 shrink-0 animate-spin text-primary" aria-hidden />
                  <p className="text-base font-medium">Slanje…</p>
                  <p className="text-sm text-muted-foreground">
                    Ovo može potrajati nekoliko sekundi.
                  </p>
                </>
              ) : (
                <>
                  <FileText
                    className="h-12 w-12 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <div className="space-y-1">
                    <p className="text-base font-medium">
                      Prevuci PDF ovdje ili klikni da izabereš
                    </p>
                    <p className="text-sm text-muted-foreground">Samo PDF · max 10 MB</p>
                    <p className="pt-1 text-sm text-muted-foreground md:hidden">
                      Na mobitelu: izaberi iz fajlova ili galerije.
                    </p>
                  </div>
                  <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                    <Button
                      type="button"
                      className="h-16 w-full min-h-[4rem] text-base sm:h-12 sm:min-h-12"
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById('import-pdf')?.click();
                      }}
                    >
                      <Upload className="mr-2 h-5 w-5" aria-hidden />
                      Izaberi fajl
                    </Button>
                    <p className="px-1 text-center text-sm text-muted-foreground sm:sr-only">
                      Izaberi iz galerije/fajlova
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {file && !isPending ? (
          <div
            className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
            data-testid="import-selected-file"
          >
            <div className="min-w-0 text-left text-base">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSizeBytes(file.size)} · {PDF_MIME}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-12 min-h-12 w-full"
                onClick={clearFile}
                disabled={isPending}
              >
                <X className="mr-2 h-4 w-4" aria-hidden />
                Ukloni
              </Button>
              <Button
                type="button"
                className="h-12 min-h-12 w-full"
                onClick={submit}
                disabled={!accountId}
              >
                Pošalji
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
