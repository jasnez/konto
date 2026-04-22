'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAccount } from '@/app/(app)/racuni/actions';
import { formatMinorUnits } from '@/lib/format/amount';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface Props {
  account: {
    id: string;
    name: string;
    icon: string | null;
    current_balance_cents: number;
    currency: string;
  };
}

/**
 * Back + key fact + actions (DS §4.3 B: detail)
 */
export function AccountDetailHeader({ account }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handleDelete() {
    setBusy(true);
    const r = await deleteAccount(account.id);
    setBusy(false);
    if (r.success) {
      setDialogOpen(false);
      toast.success('Račun je uklonjen.');
      router.push('/racuni');
      router.refresh();
      return;
    }
    if (r.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    toast.error('Nije uspjelo', { description: 'Pokušaj ponovo.' });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Button
            asChild
            variant="ghost"
            className="mb-1 -ml-2 h-11 min-h-[44px] touch-manipulation px-2 text-muted-foreground"
          >
            <Link href="/racuni" className="inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Računi
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-2xl"
              aria-hidden
            >
              {account.icon ?? '🏦'}
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{account.name}</h2>
              <p className="text-3xl font-semibold tabular-nums sm:text-4xl">
                {formatMinorUnits(account.current_balance_cents, account.currency)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {account.currency}
                </span>
              </p>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0"
              aria-label="Akcije računa"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/racuni/${account.id}/uredi`} className="min-h-11">
                Uredi
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                setDialogOpen(true);
              }}
            >
              Obriši
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati račun?</AlertDialogTitle>
            <AlertDialogDescription>
              „{account.name}” će biti uklonjen s liste. Ovo je soft delete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={busy}>
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90',
              )}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {busy ? 'Brisanje…' : 'Obriši'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
