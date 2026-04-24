'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, FilterX, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { bulkDeleteTransactions, deleteTransaction } from '@/app/(app)/transakcije/actions';
import type { AccountOption } from '@/components/account-select';
import { cn } from '@/lib/utils';
import type { CategoryOption } from '@/components/category-select';
import { DatePicker } from '@/components/date-picker';
import { QuickAddTrigger } from '@/components/shell/fab';
import { TransactionRow } from '@/components/transaction-row';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TransactionListItem, TransactionsFilters } from './types';

interface TransactionsClientProps {
  transactions: TransactionListItem[];
  filters: TransactionsFilters;
  accounts: AccountOption[];
  categories: CategoryOption[];
  totalCount: number;
  totalPages: number;
}

interface GroupedTransactions {
  label: string;
  items: { tx: TransactionListItem; index: number }[];
}

function toDateLabel(isoDate: string): string {
  const date = parseISO(isoDate);
  if (isToday(date)) return 'Danas';
  if (isYesterday(date)) return 'Juče';
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'Ova sedmica';
  return format(date, 'd. MMM yyyy.', { locale: bs });
}

function groupTransactions(transactions: TransactionListItem[]): GroupedTransactions[] {
  const groups = new Map<string, GroupedTransactions>();
  transactions.forEach((tx, index) => {
    const label = toDateLabel(tx.transaction_date);
    const current = groups.get(label);
    if (current) {
      current.items.push({ tx, index });
      return;
    }
    groups.set(label, { label, items: [{ tx, index }] });
  });
  return Array.from(groups.values());
}

function splitParamList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function getDeleteTransactionLabel(tx: TransactionListItem): string {
  const preferred = tx.merchant?.display_name ?? tx.merchant_raw ?? tx.description ?? 'Transakcija';
  return preferred.trim().length > 0 ? preferred : 'Transakcija';
}

export function TransactionsClient({
  transactions,
  filters,
  accounts,
  categories,
  totalCount,
  totalPages,
}: TransactionsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteTx, setPendingDeleteTx] = useState<TransactionListItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const refreshingRef = useRef(false);

  const grouped = useMemo(() => groupTransactions(transactions), [transactions]);
  const selectionMode = selectedIds.size > 0;

  const hasActiveFilters =
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.search.length > 0 ||
    filters.type.length > 0;

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchDraft === filters.search) return;
      updateUrl({
        search: searchDraft,
        page: '1',
      });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [filters.search, searchDraft]);

  function updateUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value.length === 0) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleMultiParam(paramName: 'account' | 'category', id: string, checked: boolean) {
    const values = new Set(splitParamList(searchParams.get(paramName)));
    if (checked) {
      values.add(id);
    } else {
      values.delete(id);
    }
    updateUrl({
      [paramName]: values.size > 0 ? Array.from(values).join(',') : null,
      page: '1',
    });
  }

  function handleToggleSelection(
    rowIndex: number,
    txId: string,
    meta: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) {
    const shouldMulti = meta.metaKey || meta.ctrlKey;

    setSelectedIds((current) => {
      const next = new Set(current);
      if (meta.shiftKey && lastSelectedIndex !== null) {
        const [start, end] =
          rowIndex > lastSelectedIndex
            ? [lastSelectedIndex, rowIndex]
            : [rowIndex, lastSelectedIndex];
        transactions.slice(start, end + 1).forEach((row) => next.add(row.id));
      } else if (shouldMulti || selectionMode) {
        if (next.has(txId)) {
          next.delete(txId);
        } else {
          next.add(txId);
        }
      } else {
        next.clear();
        next.add(txId);
      }
      return next;
    });

    setLastSelectedIndex(rowIndex);
  }

  async function handleDeleteSingle() {
    if (!pendingDeleteTx) return;
    const result = await deleteTransaction(pendingDeleteTx.id);
    if (result.success) {
      setPendingDeleteTx(null);
      toast.success('Transakcija je obrisana.');
      router.refresh();
      return;
    }
    toast.error('Brisanje nije uspjelo.', { description: 'Pokušaj ponovo.' });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const result = await bulkDeleteTransactions(Array.from(selectedIds));
    if (result.success) {
      setBulkDeleteOpen(false);
      toast.success(`Obrisano: ${String(result.data.count)} transakcija.`);
      setSelectedIds(new Set());
      router.refresh();
      return;
    }
    toast.error('Bulk brisanje nije uspjelo.');
  }

  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8"
      onTouchStart={(event) => {
        if (window.scrollY === 0) {
          setPullStartY(event.touches[0].clientY);
        }
      }}
      onTouchMove={(event) => {
        if (pullStartY === null || refreshingRef.current) return;
        const currentY = event.touches[0].clientY;
        const delta = currentY - pullStartY;
        if (delta > 0) {
          setPullDistance(Math.min(delta, 90));
        }
      }}
      onTouchEnd={() => {
        if (pullDistance > 70 && !refreshingRef.current) {
          refreshingRef.current = true;
          toast.message('Osvježavam transakcije...');
          router.refresh();
          window.setTimeout(() => {
            refreshingRef.current = false;
          }, 700);
        }
        setPullStartY(null);
        setPullDistance(0);
      }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Transakcije</h2>
        <QuickAddTrigger className="h-11 min-h-[44px] w-full sm:w-auto">+ Dodaj</QuickAddTrigger>
      </div>

      <div className="sticky top-16 z-20 mb-4 rounded-xl border bg-background/95 p-3 backdrop-blur-sm">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          <DatePicker
            value={filters.from}
            onChange={(value) => {
              updateUrl({ from: value, page: '1' });
            }}
          />
          <DatePicker
            value={filters.to}
            onChange={(value) => {
              updateUrl({ to: value, page: '1' });
            }}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-11 min-h-[44px] justify-start">
                Računi ({filters.accountIds.length || 'svi'})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {accounts.map((account) => (
                <DropdownMenuCheckboxItem
                  key={account.id}
                  checked={filters.accountIds.includes(account.id)}
                  onCheckedChange={(checked) => {
                    toggleMultiParam('account', account.id, checked);
                  }}
                >
                  {account.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-11 min-h-[44px] justify-start">
                Kategorije ({filters.categoryIds.length || 'sve'})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {categories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category.id}
                  checked={filters.categoryIds.includes(category.id)}
                  onCheckedChange={(checked) => {
                    toggleMultiParam('category', category.id, checked);
                  }}
                >
                  {category.icon ?? '📦'} {category.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={filters.type.length > 0 ? filters.type : '__all__'}
            onValueChange={(value) => {
              updateUrl({ type: value === '__all__' ? null : value, page: '1' });
            }}
          >
            <SelectTrigger className="h-11 min-h-[44px]">
              <SelectValue placeholder="Tip transakcije" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Svi tipovi</SelectItem>
              <SelectItem value="income">Prihod</SelectItem>
              <SelectItem value="expense">Trošak</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => {
                setSearchDraft(event.target.value);
              }}
              placeholder="Pretraga..."
              className="h-11 min-h-[44px] pl-9"
            />
          </div>
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchDraft('');
              router.replace(pathname);
            }}
          >
            <FilterX className="h-4 w-4" aria-hidden />
            Očisti filtere
          </button>
        ) : null}
      </div>

      {pullDistance > 0 ? (
        <div className="mb-2 text-center text-xs text-muted-foreground">
          {pullDistance > 70 ? 'Pusti za osvježavanje' : 'Povuci dole za refresh'}
        </div>
      ) : null}

      {selectionMode ? (
        <div
          className={cn(
            'z-40 flex items-center justify-between rounded-xl border bg-background/95 p-3 shadow-md backdrop-blur-sm',
            'md:sticky md:bottom-0 md:mb-3',
            'max-md:fixed max-md:left-3 max-md:right-3 max-md:mb-0',
            'max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
          )}
        >
          <p className="text-sm">{selectedIds.size} odabrano</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedIds(new Set());
              }}
            >
              Odustani
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setBulkDeleteOpen(true);
              }}
            >
              Obriši
            </Button>
          </div>
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? 'Nema transakcija za ove filtere. Pokušaj smanjiti filtere ili ih očistiti.'
              : 'Još nema transakcija. Koristi brzi unos (ili + Dodaj) da dodaš prvu — pojaviće se ovdje.'}
          </p>
          {hasActiveFilters ? null : (
            <QuickAddTrigger
              className="h-11 min-h-[44px] w-full max-w-xs"
              variant="default"
              size="default"
            >
              Otvori brzi unos
            </QuickAddTrigger>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {grouped.map((group) => (
            <li key={group.label} className="list-none">
              <div className="sticky top-[7.5rem] z-10 mb-2 rounded-md bg-background/95 px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                {group.label}
              </div>
              <ul className="space-y-2">
                {group.items.map(({ tx, index }) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    index={index}
                    selected={selectedIds.has(tx.id)}
                    selectionMode={selectionMode}
                    onOpen={(txId) => {
                      router.push(`/transakcije/${txId}`);
                    }}
                    onToggleSelection={(rowIndex, meta) => {
                      handleToggleSelection(rowIndex, tx.id, meta);
                    }}
                    onLongPressSelect={(rowIndex) => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        next.add(tx.id);
                        return next;
                      });
                      setLastSelectedIndex(rowIndex);
                    }}
                    onRequestDelete={(targetTx) => {
                      setPendingDeleteTx(targetTx);
                    }}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {totalCount > 0 ? (
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Stranica {filters.page} od {totalPages} · Ukupno {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => {
                updateUrl({ page: String(Math.max(1, filters.page - 1)) });
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Nazad
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => {
                updateUrl({ page: String(Math.min(totalPages, filters.page + 1)) });
              }}
            >
              Dalje
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={pendingDeleteTx !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTx(null);
        }}
        title={
          pendingDeleteTx
            ? `Obrisati transakciju "${getDeleteTransactionLabel(pendingDeleteTx)}"?`
            : 'Obrisati transakciju?'
        }
        description={
          pendingDeleteTx?.transfer_pair_id
            ? 'Ovo je transfer — biće obrisana oba para (zaduženje i odobrenje). Možeš ih kasnije vratiti.'
            : 'Možeš je kasnije vratiti kroz restore (soft delete).'
        }
        onConfirm={handleDeleteSingle}
      />

      <ConfirmDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Obrisati ${String(selectedIds.size)} transakcija?`}
        description="Sve odabrane transakcije će biti soft obrisane i možeš ih kasnije vratiti."
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
