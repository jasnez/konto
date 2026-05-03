'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ACCOUNT_TYPE_OPTIONS, getAccountTypeLabel } from '@/lib/accounts/constants';
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
import type { AccountsFilters } from '@/app/(app)/racuni/types';

interface AccountFiltersProps {
  filters: AccountsFilters;
  availableCurrencies: string[];
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onToggleMulti: (paramName: 'type' | 'currency', value: string, checked: boolean) => void;
  onClearAll: () => void;
}

export function AccountFilters({
  filters,
  availableCurrencies,
  searchDraft,
  onSearchDraftChange,
  onToggleMulti,
  onClearAll,
}: AccountFiltersProps) {
  const activeFilterCount = filters.type.length + filters.currency.length;
  const hasAnyFilter = activeFilterCount > 0 || filters.search.length > 0;

  return (
    <>
      <div className="-mx-4 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 md:sticky md:top-16 md:z-20">
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
              placeholder="Pretraga po nazivu ili banci..."
              className="h-11 pl-9"
              aria-label="Pretraga računa"
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
              className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:rounded-t-2xl"
            >
              <SheetHeader className="border-b p-4 text-left sm:text-left">
                <SheetTitle>Filteri</SheetTitle>
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <div className="space-y-2">
                  <Label>Tip računa</Label>
                  <div role="group" aria-label="Tip računa" className="flex flex-wrap gap-2">
                    {ACCOUNT_TYPE_OPTIONS.map((opt) => {
                      const active = filters.type.includes(opt.value);
                      return (
                        <Chip
                          key={opt.value}
                          active={active}
                          aria-pressed={active}
                          onClick={() => {
                            onToggleMulti('type', opt.value, !active);
                          }}
                        >
                          <span aria-hidden>{opt.emoji}</span>
                          <span>{opt.label}</span>
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                {availableCurrencies.length > 1 ? (
                  <div className="space-y-2">
                    <Label>Valuta</Label>
                    <div role="group" aria-label="Valuta" className="flex flex-wrap gap-2">
                      {availableCurrencies.map((currency) => {
                        const active = filters.currency.includes(currency);
                        return (
                          <Chip
                            key={currency}
                            active={active}
                            aria-pressed={active}
                            onClick={() => {
                              onToggleMulti('currency', currency, !active);
                            }}
                          >
                            {currency}
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
          className="-mx-4 mb-2 mt-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
        >
          <div className="flex min-w-max gap-2">
            {filters.type.map((type) => {
              const { emoji, label } = getAccountTypeLabel(type);
              return (
                <Chip
                  key={`type-${type}`}
                  variant="removable"
                  size="sm"
                  onClick={() => {
                    onToggleMulti('type', type, false);
                  }}
                  aria-label={`Ukloni filter: ${label}`}
                >
                  <span aria-hidden>{emoji}</span>
                  <span>{label}</span>
                  <X className="h-3 w-3" aria-hidden />
                </Chip>
              );
            })}
            {filters.currency.map((currency) => (
              <Chip
                key={`currency-${currency}`}
                variant="removable"
                size="sm"
                onClick={() => {
                  onToggleMulti('currency', currency, false);
                }}
                aria-label={`Ukloni filter: ${currency}`}
              >
                <span>{currency}</span>
                <X className="h-3 w-3" aria-hidden />
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
