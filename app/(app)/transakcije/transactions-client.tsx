'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  bulkDeleteTransactions,
  deleteTransaction,
  updateTransactionCategory,
} from '@/app/(app)/transakcije/actions';
import type { AccountOption } from '@/components/account-select';
import { cn } from '@/lib/utils';
import type { CategoryOption } from '@/components/category-select';
import { CategoryPickerSheet } from '@/components/category-picker-sheet';
import { QuickAddTrigger } from '@/components/shell/fab';
import { TransactionFilters } from '@/components/transaction-filters';
import { TransactionRow } from '@/components/transaction-row';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { useHapticFeedback } from '@/hooks/use-haptic-feedback';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { getTransactionPrimaryLabel } from '@/lib/format/transaction-primary-label';
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

// count:estimated returns planner approximation for results >1000; signal that with ≈.
function formatTotalCount(n: number): string {
  if (n <= 1000) return String(n);
  if (n < 1_000_000) return `≈ ${(n / 1000).toFixed(1)}k`;
  return `≈ ${(n / 1_000_000).toFixed(1)}M`;
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
  const haptic = useHapticFeedback();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDeleteTx, setPendingDeleteTx] = useState<TransactionListItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [categorizeTx, setCategorizeTx] = useState<TransactionListItem | null>(null);
  const [, startCategoryTransition] = useTransition();
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: () => {
      toast.message('Osvježavam transakcije...');
      router.refresh();
    },
  });

  const grouped = useMemo(() => groupTransactions(transactions), [transactions]);
  const selectionMode = selectedIds.size > 0;

  const hasActiveFilters =
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.search.length > 0 ||
    filters.type.length > 0;

  // True when at least one filter chip renders in the active-filter strip.
  // Search is NOT in the strip (it has its own visible input), so this differs
  // from `hasActiveFilters`. Drives the sticky date-header offset below.
  const hasFilterChips =
    filters.accountIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.from.length > 0 ||
    filters.to.length > 0 ||
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

  function handleCategorySelect(categoryId: string | null): void {
    const targetTx = categorizeTx;
    if (!targetTx) return;

    haptic('tap');
    setCategorizeTx(null);

    // Optimistic toast — assume success, revert on error. The server action
    // revalidates `/transakcije` so the row updates with authoritative state.
    startCategoryTransition(() => {
      void (async () => {
        const result = await updateTransactionCategory(targetTx.id, categoryId);
        if (result.success) {
          haptic('success');
          toast.success(categoryId === null ? 'Kategorija uklonjena.' : 'Kategorija promijenjena.');
          router.refresh();
          return;
        }
        haptic('error');
        toast.error('Promjena kategorije nije uspjela.', {
          description: 'Pokušaj ponovo.',
        });
      })();
    });
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
      // `--filter-region-height` matches the actual rendered height of the
      // sticky TransactionFilters region: ~3.75rem (60px) without filter chips,
      // ~6.75rem (108px) with the chip strip below the search row. Date headers
      // in the list use `top: calc(4rem + var(--filter-region-height))` to stay
      // flush against the filter region without hardcoded magic numbers.
      style={
        {
          '--filter-region-height': hasFilterChips ? '6.75rem' : '3.75rem',
        } as React.CSSProperties
      }
      className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6"
      {...pullHandlers}
    >
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Transakcije</h2>
        <QuickAddTrigger className="h-11 w-full sm:w-auto">+ Dodaj</QuickAddTrigger>
      </div>

      <TransactionFilters
        filters={filters}
        accounts={accounts}
        categories={categories}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onUpdate={updateUrl}
        onToggleMulti={toggleMultiParam}
        onClearAll={() => {
          setSearchDraft('');
          router.replace(pathname);
        }}
      />

      {pullDistance > 0 ? (
        <div className="mb-2 text-center text-xs text-muted-foreground">
          {pullDistance > 70 ? 'Pusti za osvježavanje' : 'Povuci dole za refresh'}
        </div>
      ) : null}

      {selectionMode ? (
        <div
          className={cn(
            // Quieter floating toolbar: rounded-full pill with subtle border,
            // backdrop blur, and lighter shadow. Compact buttons inside reduce
            // vertical footprint (~16px less than the previous bordered card).
            'z-40 flex items-center justify-between gap-2 rounded-full border border-border/50 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur',
            'md:sticky md:bottom-0 md:mb-3',
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

      {transactions.length === 0 ? (
        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center">
          <span className="text-4xl" aria-hidden>
            {hasActiveFilters ? '🔍' : '💸'}
          </span>
          <p className="max-w-sm text-base font-medium">
            {hasActiveFilters ? 'Nema transakcija za ove filtere.' : 'Još nema transakcija.'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Pokušaj smanjiti filtere ili ih očistiti.'
              : 'Koristi brzi unos (ili + Dodaj) da dodaš prvu — pojaviće se ovdje.'}
          </p>
          {hasActiveFilters ? null : (
            <QuickAddTrigger className="h-11 w-full max-w-xs" variant="default" size="default">
              Otvori brzi unos
            </QuickAddTrigger>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {grouped.map((group) => (
            <li key={group.label} className="list-none">
              <div className="sticky top-[calc(4rem+var(--filter-region-height,3.75rem))] z-10 mb-2 rounded-md bg-background/95 px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground backdrop-blur-sm">
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
                    onRequestCategorize={(targetTx) => {
                      setCategorizeTx(targetTx);
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
            Stranica {filters.page} od {totalPages} · Ukupno {formatTotalCount(totalCount)}
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

      <CategoryPickerSheet
        open={categorizeTx !== null}
        onOpenChange={(open) => {
          if (!open) setCategorizeTx(null);
        }}
        categories={categories}
        // Income transactions store positive amounts, expenses negative.
        // Transfers don't open this sheet (TransactionRow hides the button).
        kind={
          categorizeTx !== null && categorizeTx.original_amount_cents > 0 ? 'income' : 'expense'
        }
        currentCategoryId={categorizeTx?.category?.id ?? null}
        onSelect={handleCategorySelect}
        transactionLabel={
          categorizeTx
            ? getTransactionPrimaryLabel({
                merchant_display_name: categorizeTx.merchant?.display_name,
                merchant_raw: categorizeTx.merchant_raw,
                description: categorizeTx.description,
                is_transfer: categorizeTx.is_transfer,
                original_amount_cents: categorizeTx.original_amount_cents,
                account_name: categorizeTx.account?.name ?? null,
                transfer_counterparty_account_name: categorizeTx.transfer_counterparty_account_name,
              })
            : undefined
        }
      />
    </div>
  );
}
