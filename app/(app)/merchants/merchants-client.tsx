'use client';

import { useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteMerchant } from './actions';
import { MerchantFormDialog } from './merchant-form-dialog';
import type { MerchantListItem } from './types';

export function MerchantsClient({
  merchants,
  categoryOptions,
}: {
  merchants: MerchantListItem[];
  categoryOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<MerchantListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MerchantListItem | null>(null);

  function openCreate() {
    setMode('create');
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(m: MerchantListItem) {
    setMode('edit');
    setEditing(m);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteMerchant(deleteTarget.id);
    if (result.success) {
      setDeleteTarget(null);
      toast.success('Prodavač je obrisan.');
      router.refresh();
      return;
    }
    if (result.error === 'MERCHANT_HAS_TRANSACTIONS') {
      toast.error('Ne možeš obrisati prodavača koji ima transakcije.', {
        description: 'Prvo ukloni vezu s transakcijama ili sačekaj ažuriranje brojača.',
      });
      return;
    }
    if (result.error === 'NOT_FOUND') {
      setDeleteTarget(null);
      toast.error('Zapis više ne postoji.');
      router.refresh();
      return;
    }
    toast.error('Brisanje nije uspjelo.');
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Prodavači</h2>
        <Button type="button" className="h-11 min-h-[44px] w-full sm:w-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Dodaj merchant
        </Button>
      </div>

      {merchants.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🏪
          </span>
          <p className="text-lg font-medium">Još nema prodavača.</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Dodaj prodavače koje često vidiš na izvodima — lakše ćeš ih prepoznavati i
            kategorizirati.
          </p>
          <Button type="button" className="min-h-[44px]" onClick={openCreate}>
            Dodaj merchant
          </Button>
        </div>
      ) : (
        <ul className="list-none rounded-xl border bg-card" aria-label="Lista prodavača">
          {merchants.map((m) => (
            <li
              key={m.id}
              className="flex h-16 min-h-16 items-center gap-3 border-b border-border px-3 last:border-b-0"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center text-xl leading-none">
                {m.icon ? (
                  <span aria-hidden>{m.icon}</span>
                ) : (
                  <span className="text-muted-foreground">·</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.display_name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {m.canonical_name}
                  {m.category_name ? ` · ${m.category_name}` : ''}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {m.transaction_count} tx
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label="Meni"
                  >
                    <MoreHorizontal className="h-5 w-5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      openEdit(m);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    Uredi
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      setDeleteTarget(m);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Obriši
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <MerchantFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={mode}
        merchant={editing}
        categoryOptions={categoryOptions}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget
            ? `Obrisati prodavača "${deleteTarget.display_name}"?`
            : 'Obrisati prodavača?'
        }
        description="Možeš obrisati prodavača samo ako nema povezanih transakcija (broj transakcija = 0)."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
