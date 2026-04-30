'use client';

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
      <div className="sticky top-16 z-20 -mx-4 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
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
              className="h-11 min-h-[44px] pl-9"
              aria-label="Pretraga transakcija"
            />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-[44px] shrink-0 gap-1.5 px-3"
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
              className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0"
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
                  <div className="grid grid-cols-4 gap-2">
                    {TYPE_OPTIONS.map(({ value, label }) => {
                      const active =
                        value === '' ? filters.type.length === 0 : filters.type === value;
                      return (
                        <Chip
                          key={value || 'all'}
                          active={active}
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
                    <div className="flex flex-wrap gap-2">
                      {accounts.map((account) => {
                        const active = filters.accountIds.includes(account.id);
                        return (
                          <Chip
                            key={account.id}
                            active={active}
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
                  <div className="space-y-2">
                    <Label>Kategorije</Label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((category) => {
                        const active = filters.categoryIds.includes(category.id);
                        return (
                          <Chip
                            key={category.id}
                            active={active}
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
                ) : null}
              </div>
              <SheetFooter className="flex flex-row gap-2 border-t p-4 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-h-[44px] flex-1"
                  disabled={!hasAnyFilter}
                  onClick={onClearAll}
                >
                  Očisti sve
                </Button>
                <SheetClose asChild>
                  <Button type="button" className="h-11 min-h-[44px] flex-1">
                    Gotovo
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {activeFilterCount > 0 ? (
        <div className="-mx-4 mb-2 mt-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-2">
            {filters.from ? (
              <Chip
                variant="removable"
                size="sm"
                onClick={() => {
                  onUpdate({ from: null, page: '1' });
                }}
                aria-label={`Ukloni filter: Od ${filters.from}`}
              >
                <span>Od: {filters.from}</span>
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
                aria-label={`Ukloni filter: Do ${filters.to}`}
              >
                <span>Do: {filters.to}</span>
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
