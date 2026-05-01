import { formatMoney } from '@/lib/format/format-money';
import { cn } from '@/lib/utils';

// One place to spell "how money looks in the Konto UI":
//   * always bs-BA number formatting
//   * tabular-nums so columns line up
//   * red expense / green income / blue transfer / muted zero, overridable
// Sites that want raw text should keep calling formatMoney() directly.

export type MoneyTone = 'auto' | 'income' | 'expense' | 'transfer' | 'neutral' | 'default';

interface MoneyProps {
  cents: bigint;
  currency: string;
  /**
   * Coloring intent.
   *   - `auto` (default): colour by sign — positive = income, negative = expense, zero = neutral.
   *   - `income` / `expense` / `transfer`: forced colour regardless of sign.
   *   - `neutral`: muted-foreground.
   *   - `default`: inherit from parent, no tone class.
   */
  tone?: MoneyTone;
  /** @default true */
  showCurrency?: boolean;
  /** @default 'bs-BA' */
  locale?: string;
  className?: string;
}

// Use semantic tokens (defined in app/globals.css :root + .dark) so light/dark
// saturation lives in the design system, not in component code.
const TONE_CLASS: Record<Exclude<MoneyTone, 'auto' | 'default'>, string> = {
  income: 'text-income',
  expense: 'text-expense',
  transfer: 'text-transfer',
  neutral: 'text-muted-foreground',
};

function resolveTone(tone: MoneyTone, cents: bigint): string | null {
  if (tone === 'default') return null;
  if (tone === 'auto') {
    if (cents > 0n) return TONE_CLASS.income;
    if (cents < 0n) return TONE_CLASS.expense;
    return TONE_CLASS.neutral;
  }
  return TONE_CLASS[tone];
}

export function Money({
  cents,
  currency,
  tone = 'auto',
  showCurrency = true,
  locale = 'bs-BA',
  className,
}: MoneyProps) {
  const formatted = formatMoney(cents, currency, locale, { showCurrency });
  const toneClass = resolveTone(tone, cents);
  return <span className={cn('tabular-nums', toneClass, className)}>{formatted}</span>;
}
