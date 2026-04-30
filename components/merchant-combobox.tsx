'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { searchMerchants, type MerchantResult } from '@/app/(app)/merchants/actions';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MerchantComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  onBlurValue?: (value: string, knownMerchant: boolean) => void;
  onEnterNext?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
}

function normalizeMerchantName(value: string): string {
  return value.trim().toLowerCase();
}

function useMerchantSearch(query: string) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MerchantResult[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        const response = await searchMerchants(term, 8);
        if (cancelled) return;
        if (response.success) {
          setResults(response.data);
        } else {
          setResults([]);
        }
        setLoading(false);
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query]);

  return { loading, results };
}

export function MerchantCombobox({
  value,
  onValueChange,
  onBlurValue,
  onEnterNext,
  inputRef,
  disabled = false,
}: MerchantComboboxProps) {
  const [open, setOpen] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const { loading, results } = useMerchantSearch(value);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const knownMerchant = useMemo(() => {
    const normalized = normalizeMerchantName(value);
    if (normalized.length === 0) return true;
    return results.some((merchant) => normalizeMerchantName(merchant.display_name) === normalized);
  }, [results, value]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        autoComplete="off"
        placeholder="npr. Konzum"
        className="h-11"
        onFocus={() => {
          setOpen(true);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimeoutRef.current = window.setTimeout(() => {
            setOpen(false);
            onBlurValue?.(value, knownMerchant);
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnterNext?.();
          }
        }}
      />
      {open && !disabled ? (
        <div className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Učitavam...
                  </span>
                ) : (
                  'Nema rezultata'
                )}
              </CommandEmpty>
              <CommandGroup heading="Prodavači">
                {results.map((merchant) => {
                  const selected =
                    normalizeMerchantName(merchant.display_name) === normalizeMerchantName(value);
                  return (
                    <CommandItem
                      key={merchant.id}
                      value={merchant.display_name}
                      onSelect={() => {
                        onValueChange(merchant.display_name);
                        setOpen(false);
                        onEnterNext?.();
                      }}
                    >
                      <Check className={cn('h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{merchant.display_name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
