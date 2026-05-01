'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { bulkDeleteAccounts } from '@/app/(app)/racuni/actions';
import { AccountCard } from '@/components/account-card';
import { AccountFilters } from '@/components/account-filters';
import { AccountGroupHeader } from '@/components/account-group-header';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { cn } from '@/lib/utils';
import type {
  AccountGroup,
  AccountLastTransaction,
  AccountsFilters,
} from '@/app/(app)/racuni/types';

const SEARCH_DEBOUNCE_MS = 300;

interface AccountsClientProps {
  groups: AccountGroup[];
  filters: AccountsFilters;
  availableCurrencies: string[];
  baseCurrency: string;
  totalCount: number;
  /** Keyed by account.id; entry is omitted when an account has no activity. */
  lastTransactionByAccount: Record<string, AccountLastTransaction>;
}

function splitParamList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function AccountsClient({
  groups,
  filters,
  availableCurrencies,
  totalCount,
  lastTransactionByAccount,
}: AccountsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const allFilteredIds = groups.flatMap((g) => g.accounts.map((a) => a.id));
  const filteredCount = allFilteredIds.length;
  const selectionMode = selectedIds.size > 0;
  const allSelected = filteredCount > 0 && selectedIds.size === filteredCount;
  const hasActiveFilters =
    filters.type.length > 0 || filters.currency.length > 0 || filters.search.length > 0;

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchDraft === filters.search) return;
      updateUrl({ search: searchDraft });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [filters.search, searchDraft]);

  function updateUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value.length === 0) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function toggleMultiParam(paramName: 'type' | 'currency', value: string, checked: boolean) {
    const values = new Set(splitParamList(searchParams.get(paramName)));
    if (checked) {
      values.add(value);
    } else {
      values.delete(value);
    }
    updateUrl({
      [paramName]: values.size > 0 ? Array.from(values).join(',') : null,
    });
  }

  function clearAllFilters() {
    setSearchDraft('');
    router.replace(pathname);
  }

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
      <AccountFilters
        filters={filters}
        availableCurrencies={availableCurrencies}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onToggleMulti={toggleMultiParam}
        onClearAll={clearAllFilters}
      />

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
                setSelectedIds(allSelected ? new Set() : new Set(allFilteredIds));
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

      {filteredCount === 0 ? (
        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🔍
          </span>
          <p className="max-w-sm text-base font-medium">Nema računa za ove filtere.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Pokušaj smanjiti filtere ili ih očistiti.
          </p>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full max-w-xs"
              onClick={clearAllFilters}
            >
              Očisti sve
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="list-none space-y-6" aria-label="Lista računa">
          {groups.map((group) => (
            <li key={group.type} className="space-y-3">
              <AccountGroupHeader group={group} />
              <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2">
                {group.accounts.map((a) => (
                  <li key={a.id}>
                    <AccountCard
                      account={a}
                      selected={selectedIds.has(a.id)}
                      onToggleSelection={handleToggle}
                      lastTransaction={lastTransactionByAccount[a.id]}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {totalCount > 0 && filteredCount > 0 && hasActiveFilters ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Prikazano {filteredCount} od {totalCount} računa
        </p>
      ) : null}

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
