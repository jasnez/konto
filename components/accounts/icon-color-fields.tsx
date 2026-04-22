'use client';

import { Label } from '@/components/ui/label';
import { SUGGESTED_ACCOUNT_COLORS, SUGGESTED_ACCOUNT_ICONS } from '@/lib/accounts/constants';
import { cn } from '@/lib/utils';

interface IconFieldProps {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  disabled?: boolean;
  error?: string;
}

export function AccountIconField({ value, onChange, id, disabled, error }: IconFieldProps) {
  return (
    <div className="space-y-2">
      <Label id={id ? `${id}-label` : undefined} htmlFor={id}>
        Ikonica
      </Label>
      <p className="text-xs text-muted-foreground" id={id ? `${id}-desc` : undefined}>
        Brzi odabir; možeš i zalijepiti drugi emoji u polje ispod.
      </p>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-labelledby={id ? `${id}-label` : undefined}
      >
        {SUGGESTED_ACCOUNT_ICONS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(e);
            }}
            className={cn(
              'flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border-2 text-xl transition-colors',
              value === e
                ? 'border-primary bg-accent'
                : 'border-transparent bg-muted/50 hover:border-muted-foreground/30',
            )}
            aria-pressed={value === e}
            aria-label={`Ikonica ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <input
        id={id}
        className="flex h-11 min-h-[44px] w-full max-w-xs rounded-md border border-input bg-background px-3 text-base"
        maxLength={10}
        disabled={disabled}
        value={value ?? ''}
        onChange={(ev) => {
          const t = ev.target.value.trim();
          onChange(t === '' ? null : t);
        }}
        placeholder="npr. 🏦"
        aria-describedby={id ? `${id}-desc` : undefined}
        aria-invalid={error ? 'true' : 'false'}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

interface ColorFieldProps {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  disabled?: boolean;
  error?: string;
}

export function AccountColorField({ value, onChange, id, disabled, error }: ColorFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id ?? 'color-hidden'}>Boja (kartica u listi)</Label>
      <div className="flex flex-wrap items-center gap-2">
        {SUGGESTED_ACCOUNT_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(hex);
            }}
            className={cn(
              'h-11 w-11 min-h-[44px] min-w-[44px] rounded-full border-2',
              (value ?? '').toLowerCase() === hex.toLowerCase()
                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'border-transparent',
            )}
            style={{ backgroundColor: hex }}
            aria-label={`Boja ${hex}`}
            aria-pressed={(value ?? '').toLowerCase() === hex.toLowerCase()}
          />
        ))}
        <input
          id={id}
          type="color"
          disabled={disabled}
          value={value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#22c55e'}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
          }}
          className="h-11 w-20 min-w-[5rem] cursor-pointer bg-transparent p-1"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
