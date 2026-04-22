'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface MoneyInputPlaceholderProps {
  id: string;
  label: string;
  /** Minor units (cents) as decimal string, e.g. "1250" for 12,50 */
  value: string;
  onChange: (cents: string) => void;
  currency: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * T3 će zamijeniti pravu `<MoneyInput />` komponentu. Za sada: unos
 * s decimalnim zarezom, konverzija u cijele cente kao string.
 */
export function MoneyInputPlaceholder({
  id,
  label,
  value,
  onChange,
  currency,
  error,
  disabled,
  className,
}: MoneyInputPlaceholderProps) {
  const centsBig = React.useMemo(() => {
    try {
      return BigInt(value || '0');
    } catch {
      return BigInt(0);
    }
  }, [value]);

  const [text, setText] = React.useState(() => centsToDisplay(centsBig));

  React.useEffect(() => {
    setText(centsToDisplay(centsBig));
  }, [centsBig]);

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const c = displayToCentsString(raw);
            if (c !== null) onChange(c);
          }}
          onBlur={() => {
            const c = displayToCentsString(text);
            if (c !== null) onChange(c);
            setText(centsToDisplay(BigInt(c ?? '0')));
          }}
          placeholder="0,00"
          className={cn('h-11 min-h-[44px] font-mono tabular-nums', error && 'border-destructive')}
          aria-invalid={error ? 'true' : 'false'}
        />
        <span
          className="flex h-11 min-w-[3.5rem] shrink-0 items-center justify-center rounded-md border bg-muted px-2 text-sm text-muted-foreground"
          aria-hidden
        >
          {currency}
        </span>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function centsToDisplay(cents: bigint): string {
  const H = BigInt(100);
  const sign = cents < BigInt(0) ? BigInt(-1) : BigInt(1);
  const v = sign * cents;
  const whole = v / H;
  const frac = v % H;
  const f = String(H + frac).slice(1);
  const signPrefix = sign < BigInt(0) ? '−' : '';
  return `${signPrefix}${String(whole)},${f}`;
}

function displayToCentsString(input: string): string | null {
  const t = input.trim();
  if (t === '' || t === '−' || t === '-') return t === '−' || t === '-' ? null : '0';
  const neg = t.startsWith('−') || t.startsWith('-');
  const core = t.replace(/^[−-]/, '').replace(/\s/g, '');
  if (core === '') return '0';
  const normalized = core.replace(/\./, ',');
  const parts = normalized.split(',');
  if (parts.length > 2) return null;
  const w = (parts[0] ?? '0').replace(/[^\d]/g, '') || '0';
  const fRaw = parts[1] ?? '';
  if (fRaw.length > 2) return null;
  if (!/^\d*$/.test(fRaw) && fRaw.length > 0) return null;
  const f = (fRaw + '00').slice(0, 2);
  const h = BigInt(100);
  const cents = BigInt(w) * h + BigInt(f);
  const max = BigInt('9223372036854775807');
  if (cents > max) return null;
  const signed = neg ? -cents : cents;
  return String(signed);
}
