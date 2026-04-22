'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteAccount } from '@/app/(app)/racuni/actions';
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Props {
  accountId: string;
  accountName: string;
}

export function AccountCardDelete({ accountId, accountName }: Props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();

  async function handleDelete() {
    setBusy(true);
    const r = await deleteAccount(accountId);
    setBusy(false);
    if (r.success) {
      setOpen(false);
      toast.success('Račun je uklonjen.');
      router.refresh();
      return;
    }
    if (r.error === 'VALIDATION_ERROR') {
      toast.error('Nevažeći id.');
      return;
    }
    if (r.error === 'UNAUTHORIZED') {
      toast.error('Sesija je istekla.', { description: 'Prijavi se ponovo.' });
      return;
    }
    if (r.error === 'NOT_FOUND') {
      toast.error('Račun nije pronađen.');
      return;
    }
    toast.error('Nije uspjelo', { description: 'Pokušaj ponovo.' });
  }

  return (
    <>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          setOpen(true);
        }}
      >
        Obriši
      </DropdownMenuItem>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati račun?</AlertDialogTitle>
            <AlertDialogDescription>
              Račun „{accountName}” bit će skriven. Transakcije ostaju u bazi (soft delete) dok se
              logika ne promijeni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={busy}>
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
    </>
  );
}
