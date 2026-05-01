'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { bulkDeleteAccounts } from '@/app/(app)/racuni/actions';
import { AccountCard } from '@/components/account-card';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import type { Account } from '@/lib/supabase/types';

interface AccountsClientProps {
  accounts: Account[];
}

export function AccountsClient({ accounts }: AccountsClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const selectionMode = selectedIds.size > 0;
  const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;

  function handleToggle(accountId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const result = await bulkDeleteAccounts(Array.from(selectedIds));
    if (result.success) {
      setBulkDeleteOpen(false);
      const { accountsCount, transactionsCount } = result.data;
      const txPart = transactionsCount > 0 ? ` · ${String(transactionsCount)} transakcija` : '';
      toast.success(`Obrisano: ${String(accountsCount)} računa${txPart}.`);
      setSelectedIds(new Set());
      router.refresh();
      return;
    }
    toast.error('Bulk brisanje nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  return (
    <>
      {selectionMode ? (
        <div
          className={cn(
            'z-40 mb-4 flex items-center justify-between gap-2 rounded-full border border-border/50 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur',
            'md:sticky md:bottom-0',
            'max-md:fixed max-md:left-3 max-md:right-3 max-md:mb-0',
            'max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
          )}
        >
          <p className="text-xs font-medium">{selectedIds.size} odabrano</p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => {
                setSelectedIds(allSelected ? new Set() : new Set(accounts.map((a) => a.id)));
              }}
            >
              {allSelected ? 'Odznači sve' : 'Označi sve'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => {
                setSelectedIds(new Set());
              }}
            >
              Odustani
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="compact"
              onClick={() => {
                setBulkDeleteOpen(true);
              }}
            >
              Obriši
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Lista računa">
        {accounts.map((a) => (
          <li key={a.id}>
            <AccountCard
              account={a}
              selected={selectedIds.has(a.id)}
              onToggleSelection={handleToggle}
            />
          </li>
        ))}
      </ul>

      <ConfirmDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Obrisati ${String(selectedIds.size)} ${selectedIds.size === 1 ? 'račun' : 'računa'}?`}
        description="Računi i sve njihove transakcije biće soft obrisane (mogu se vratiti kroz restore)."
        onConfirm={handleBulkDelete}
      />
    </>
  );
}
