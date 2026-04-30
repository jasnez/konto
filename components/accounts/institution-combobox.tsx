'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { BIH_INSTITUTIONS } from '@/lib/accounts/constants';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface InstitutionComboboxProps {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Combobox: predefinisane banke u BiH + slobodan unos (pretraga, zatim Enter na prazno ili tipka).
 */
export function InstitutionCombobox({
  value,
  onChange,
  id,
  disabled,
  className,
}: InstitutionComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'h-11 w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="line-clamp-1 text-left">
            {value && value.length > 0 ? value : 'Odaberi ili upiši banku…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          shouldFilter
          onKeyDown={(e) => {
            if (e.key === 'Enter' && open) {
              const input = e.currentTarget.querySelector('input');
              const raw = input instanceof HTMLInputElement ? input.value : '';
              const t = raw.trim() !== '' ? raw.trim() : q.trim();
              if (t) {
                onChange(t);
                setOpen(false);
                setQ('');
              }
            }
          }}
        >
          <CommandInput
            placeholder="Pretraži ili upiši cijeli naziv…"
            className="h-11"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start text-sm"
                onClick={() => {
                  const t = q.trim();
                  if (t) {
                    onChange(t);
                    setOpen(false);
                    setQ('');
                  }
                }}
                disabled={!q.trim()}
              >
                Spremi: “{q.trim() || '…'}”
              </Button>
            </CommandEmpty>
            <CommandGroup heading="Banke u BiH">
              {BIH_INSTITUTIONS.map((b) => (
                <CommandItem
                  key={b}
                  value={b}
                  onSelect={() => {
                    onChange(b);
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === b ? 'opacity-100' : 'opacity-0')}
                  />
                  {b}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
