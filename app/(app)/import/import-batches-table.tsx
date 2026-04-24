import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImportListRow, ImportStatus } from './types';

function statusLabel(status: ImportStatus): string {
  switch (status) {
    case 'uploaded':
      return 'Učitano';
    case 'parsing':
      return 'Obrada';
    case 'ready':
      return 'Pregled';
    case 'imported':
      return 'Uvezeno';
    case 'failed':
      return 'Neuspjelo';
    default:
      return status;
  }
}

function statusBadgeClass(status: ImportStatus): string {
  switch (status) {
    case 'uploaded':
      return 'border-border bg-muted text-muted-foreground';
    case 'parsing':
      return 'border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/15 text-foreground';
    case 'ready':
      return 'border-[hsl(var(--transfer))] bg-[hsl(var(--transfer))]/15 text-foreground';
    case 'imported':
      return 'border-primary/40 bg-primary/10 text-foreground';
    case 'failed':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function formatDate(iso: string) {
  try {
    return format(parseISO(iso), 'd. MMM yyyy, HH:mm', { locale: bs });
  } catch {
    return '—';
  }
}

function formatInt(n: number) {
  return n.toLocaleString('bs-BA');
}

export function ImportBatchesTable({ rows }: { rows: ImportListRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center"
        data-testid="import-empty"
      >
        <p className="text-base text-muted-foreground">
          Još nisi uvezao niti jedan izvod. Prevuci PDF iznad.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-left text-sm">
        <caption className="sr-only">Prethodni uvozni poslovi</caption>
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
            <th className="w-[1%] whitespace-nowrap py-2 pr-3 font-medium" scope="col">
              Datum uploada
            </th>
            <th className="py-2 pr-3 font-medium" scope="col">
              Banka
            </th>
            <th className="w-[1%] py-2 pr-3 font-medium" scope="col">
              Status
            </th>
            <th className="w-[1%] py-2 pr-3 text-right font-medium tabular-nums" scope="col">
              # transakcija
            </th>
            <th className="w-[1%] py-2 text-right font-medium" scope="col">
              Akcije
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap py-3 pr-3 text-base tabular-nums text-foreground/90">
                {formatDate(row.createdAt)}
              </td>
              <td className="max-w-[12rem] truncate py-3 pr-3 text-base" title={row.bankLabel}>
                {row.bankLabel}
              </td>
              <td className="py-3 pr-3">
                <Badge
                  variant="outline"
                  className={cn('font-medium', statusBadgeClass(row.status))}
                >
                  {statusLabel(row.status)}
                </Badge>
              </td>
              <td className="py-3 pr-3 text-right text-base font-medium tabular-nums text-foreground">
                {formatInt(row.transactionCount)}
              </td>
              <td className="py-3 text-right">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-12 min-h-12 gap-1 px-3 sm:px-3"
                >
                  <Link
                    href={`/import/${row.id}`}
                    className="inline-flex min-h-12 min-w-12 items-center"
                  >
                    <span className="hidden sm:inline">Detalj</span>
                    <span className="sm:sr-only">Otvori detalj {row.id}</span>
                    <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
