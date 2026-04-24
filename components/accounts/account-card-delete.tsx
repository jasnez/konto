'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteAccount } from '@/app/(app)/racuni/actions';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

interface Props {
  accountId: string;
  accountName: string;
}

export function AccountCardDelete({ accountId, accountName }: Props) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  async function handleDelete() {
    const r = await deleteAccount(accountId);
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
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Obrisati račun "${accountName}"?`}
        description="Račun će biti skriven (soft delete), a postojeće transakcije ostaju u bazi."
        onConfirm={handleDelete}
      />
    </>
  );
}
