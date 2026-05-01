'use client';

import { format, parseISO } from 'date-fns';
import { bs } from 'date-fns/locale';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';
import { DatePicker } from '@/components/date-picker';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { TransactionsFilters } from '@/app/(app)/transakcije/types';

interface TransactionFiltersProps {
  filters: TransactionsFilters;
  accounts: AccountOption[];
  categories: CategoryOption[];
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onUpdate: (updates: Record<string, string | null>) => void;
  onToggleMulti: (paramName: 'account' | 'category', id: string, checked: boolean) => void;
  onClearAll: () => void;
}

const TYPE_OPTIONS: { value: '' | 'income' | 'expense' | 'transfer'; label: string }[] = [
  { value: '', label: 'Svi' },
  { value: 'income', label: 'Prihod' },
  { value: 'expense', label: 'Trošak' },
  { value: 'transfer', label: 'Transfer' },
];

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? '';
}

/**
 * Render an ISO date as `1. apr 2026.` (bs locale).
 *
 * On parse error (corrupt URL param like `?from=foo`) returns a clear "?"
 * marker rather than the raw garbage string. The chip stays clickable so the
 * user can remove the broken filter; the marker signals "filter is invalid"
 * better than echoing nonsense back at them.
 */
function formatBsDate(iso: string): string {
  try {
    const date = parseISO(iso);
    if (Number.isNaN(date.getTime())) {
      return '?';
    }
    return format(date, 'd. MMM yyyy.', { locale: bs });
  } catch {
    return '?';
  }
}

export function TransactionFilters({
  filters,
  accounts,
  categories,
  searchDraft,
  onSearchDraftChange,
  onUpdate,
  onToggleMulti,
  onClearAll,
}: TransactionFiltersProps) {
  const activeFilterCount =
    filters.accountIds.length +
    filters.categoryIds.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.type.length > 0 ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || filters.search.length > 0;

  return (
    <>
      <div className="pointer-events-none sticky top-16 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
        {/* The outer sticky wrapper has `pointer-events-none` so a finger pull
            that lands on the bar's padding/background still bubbles to the
            wrapper's pull-to-refresh handler in transactions-client.tsx. The
            interactive children (search input, Filteri button) re-enable
            pointer events explicitly via this inner div. */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchDraft}
              onChange={(event) => {
                onSearchDraftChange(event.target.value);
              }}
              placeholder="Pretraga..."
              className="h-11 pl-9"
              aria-label="Pretraga transakcija"
            />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 gap-1.5 px-3"
                aria-label={
                  activeFilterCount > 0
                    ? `Filteri (${String(activeFilterCount)} aktivnih)`
                    : 'Filteri'
                }
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Filteri</span>
                {activeFilterCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              // Full-height takeover on mobile so the long Categories list is
              // always reachable (was getting cut off in landscape with the
              // previous `max-h-[85vh]`). Matches Quick-Add sheet pattern.
              // Auto-height with cap on tablet+ where vertical space allows.
              className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:rounded-t-2xl"
            >
              <SheetHeader className="border-b p-4 text-left sm:text-left">
                <SheetTitle>Filteri</SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <div className="space-y-2">
                  <Label>Period</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <DatePicker
                      value={filters.from}
                      onChange={(value) => {
                        onUpdate({ from: value, page: '1' });
                      }}
                    />
                    <DatePicker
                      value={filters.to}
                      onChange={(value) => {
                        onUpdate({ to: value, page: '1' });
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tip</Label>
                  <div role="group" aria-label="Tip transakcije" className="grid grid-cols-4 gap-2">
                    {TYPE_OPTIONS.map(({ value, label }) => {
                      const active =
                        value === '' ? filters.type.length === 0 : filters.type === value;
                      return (
                        <Chip
                          key={value || 'all'}
                          active={active}
                          aria-pressed={active}
                          onClick={() => {
                            onUpdate({ type: value === '' ? null : value, page: '1' });
                          }}
                        >
                          <span className="truncate">{label}</span>
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                {accounts.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Računi</Label>
                    <div role="group" aria-label="Računi" className="flex flex-wrap gap-2">
                      {accounts.map((account) => {
                        const active = filters.accountIds.includes(account.id);
                        return (
                          <Chip
                            key={account.id}
                            active={active}
                            aria-pressed={active}
                            onClick={() => {
                              onToggleMulti('account', account.id, !active);
                            }}
                          >
                            {account.name}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {categories.length > 0 ? (
                  <div className="space-y-3">
                    <Label>Kategorije</Label>
                    {/* Grouped by kind so the long category list isn't a wall
                     * of mixed pills (audit N14). Section headers mirror the
                     * /kategorije tab labels (Troškovi / Prihodi / Transferi).
                     * `saving` and `investment` kinds aren't surfaced as their
                     * own group — they're rare and fold into the same default
                     * sort order; if/when they grow we can add sections. */}
                    {(
                      [
                        { heading: 'Troškovi', kind: 'expense' },
                        { heading: 'Prihodi', kind: 'income' },
                        { heading: 'Transferi', kind: 'transfer' },
                      ] as const
                    ).map(({ heading, kind }) => {
                      const groupCategories = categories.filter((c) => c.kind === kind);
                      if (groupCategories.length === 0) return null;
                      return (
                        <div key={kind} className="space-y-1.5">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {heading}
                          </p>
                          <div
                            role="group"
                            aria-label={`Kategorije: ${heading}`}
                            className="flex flex-wrap gap-2"
                          >
                            {groupCategories.map((category) => {
                              const active = filters.categoryIds.includes(category.id);
                              return (
                                <Chip
                                  key={category.id}
                                  active={active}
                                  aria-pressed={active}
                                  onClick={() => {
                                    onToggleMulti('category', category.id, !active);
                                  }}
                                >
                                  {category.icon ? <span aria-hidden>{category.icon}</span> : null}
                                  <span>{category.name}</span>
                                </Chip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <SheetFooter className="flex flex-row gap-2 border-t p-4 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  disabled={!hasAnyFilter}
                  onClick={onClearAll}
                >
                  Očisti sve
                </Button>
                <SheetClose asChild>
                  <Button type="button" className="h-11 flex-1">
                    Gotovo
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {activeFilterCount > 0 ? (
        <div
          role="region"
          aria-label="Aktivni filteri"
          // pointer-events-none on the wrapper so a touch landing on the
          // strip's padding still bubbles to pull-to-refresh; chips re-enable
          // pointer events on the inner flex container.
          className="pointer-events-none -mx-4 mb-2 mt-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
        >
          <div className="pointer-events-auto flex min-w-max gap-2">
            {filters.from ? (
              <Chip
                variant="removable"
                size="sm"
                onClick={() => {
                  onUpdate({ from: null, page: '1' });
                }}
                aria-label={`Ukloni filter: Od ${formatBsDate(filters.from)}`}
              >
                <span>Od: {formatBsDate(filters.from)}</span>
                <X className="h-3 w-3" aria-hidden />
              </Chip>
            ) : null}
            {filters.to ? (
              <Chip
                variant="removable"
                size="sm"
                onClick={() => {
                  onUpdate({ to: null, page: '1' });
                }}
                aria-label={`Ukloni filter: Do ${formatBsDate(filters.to)}`}
              >
                <span>Do: {formatBsDate(filters.to)}</span>
                <X className="h-3 w-3" aria-hidden />
              </Chip>
            ) : null}
            {filters.accountIds.map((id) => {
              const account = accounts.find((a) => a.id === id);
              if (!account) return null;
              return (
                <Chip
                  key={`account-${id}`}
                  variant="removable"
                  size="sm"
                  onClick={() => {
                    onToggleMulti('account', id, false);
                  }}
                  aria-label={`Ukloni filter: ${account.name}`}
                >
                  <span>{account.name}</span>
                  <X className="h-3 w-3" aria-hidden />
                </Chip>
              );
            })}
            {filters.categoryIds.map((id) => {
              const category = categories.find((c) => c.id === id);
              if (!category) return null;
              const label = category.icon ? `${category.icon} ${category.name}` : category.name;
              return (
                <Chip
                  key={`category-${id}`}
                  variant="removable"
                  size="sm"
                  onClick={() => {
                    onToggleMulti('category', id, false);
                  }}
                  aria-label={`Ukloni filter: ${category.name}`}
                >
                  <span>{label}</span>
                  <X className="h-3 w-3" aria-hidden />
                </Chip>
              );
            })}
            {filters.type.length > 0 ? (
              <Chip
                variant="removable"
                size="sm"
                onClick={() => {
                  onUpdate({ type: null, page: '1' });
                }}
                aria-label={`Ukloni filter: ${typeLabel(filters.type)}`}
              >
                <span>{typeLabel(filters.type)}</span>
                <X className="h-3 w-3" aria-hidden />
              </Chip>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
