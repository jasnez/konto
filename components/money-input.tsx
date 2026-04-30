'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CURRENCIES } from '@/lib/accounts/constants';
import { formatMoney } from '@/lib/format/format-money';
import { parseMoneyString } from '@/lib/format/parse-money';

function formatInputDisplay(cents: bigint, currency: string, locale: string): string {
  return formatMoney(cents, currency, locale, { showCurrency: false });
}

function clampToBounds(cents: bigint, max: bigint | undefined, allowNegative: boolean): bigint {
  let n = cents;
  if (!allowNegative && n < 0n) {
    n = 0n;
  }
  if (max !== undefined && n > max) {
    n = max;
  }
  if (!allowNegative && n < 0n) {
    n = 0n;
  }
  return n;
}

export interface MoneyInputProps {
  value: bigint;
  onChange: (cents: bigint) => void;
  currency: string;
  onCurrencyChange?: (c: string) => void;
  allowNegative?: boolean;
  /** @default "0,00" */
  placeholder?: string;
  disabled?: boolean;
  max?: bigint;
  size?: 'default' | 'lg';
  className?: string;
  id?: string;
  error?: string;
  /** @default "Iznos" */
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** @default "bs-BA" */
  locale?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/**
 * @see docs/03-design-system.md §3.3.2
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  onCurrencyChange,
  allowNegative = false,
  placeholder = '0,00',
  disabled = false,
  max,
  size = 'default',
  className,
  id,
  error,
  'aria-label': ariaLabel = 'Iznos',
  'aria-describedby': ariaDescribedBy,
  locale = 'bs-BA',
  autoFocus = false,
  inputRef,
  onKeyDown,
}: MoneyInputProps) {
  const [draft, setDraft] = React.useState(() => formatInputDisplay(value, currency, locale));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) {
      setDraft(formatInputDisplay(value, currency, locale));
    }
  }, [value, focused, currency, locale]);

  const sizeClass =
    size === 'lg'
      ? 'min-h-12 h-12 text-2xl font-semibold md:min-h-[3rem] md:text-3xl'
      : 'h-11 text-base';

  const commitBlur = React.useCallback(
    (raw: string) => {
      const p = parseMoneyString(raw, locale);
      if (p === null) {
        setDraft(formatInputDisplay(value, currency, locale));
        return;
      }
      const clamped = clampToBounds(p, max, allowNegative);
      if (clamped !== value) {
        onChange(clamped);
      }
      setDraft(formatInputDisplay(clamped, currency, locale));
    },
    [allowNegative, currency, locale, max, onChange, value],
  );

  return (
    <div className={cn('flex w-full max-w-full gap-2', className)}>
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={ariaDescribedBy}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          const p = parseMoneyString(v, locale);
          if (p === null) {
            return;
          }
          if (p < 0n && !allowNegative) {
            return;
          }
          if (max !== undefined && p > max) {
            return;
          }
          onChange(p);
        }}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commitBlur(draft);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'shrink-1 min-w-0 max-w-full flex-1 text-right font-mono tabular-nums ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          sizeClass,
          error && 'border-destructive',
        )}
      />
      {onCurrencyChange ? (
        <Select value={currency} onValueChange={onCurrencyChange} disabled={disabled}>
          <SelectTrigger
            className="h-11 w-auto min-w-[4.5rem] shrink-0 sm:min-w-[5rem]"
            aria-label="Valuta"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === 'BAM' ? 'KM' : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span
          className="flex h-11 w-auto min-w-[2.75rem] shrink-0 select-none items-center justify-center rounded-md border border-input bg-muted px-2.5 text-sm text-muted-foreground"
          aria-hidden
        >
          {currency === 'BAM' ? 'KM' : currency}
        </span>
      )}
    </div>
  );
}
