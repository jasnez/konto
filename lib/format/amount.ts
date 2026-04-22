import { CURRENCIES, type CurrencyCode, getCurrencyLabel } from '@/lib/accounts/constants';

const currencySet = new Set<string>(CURRENCIES);

/**
 * Formats a signed integer minor-units value for display in bs-BA locale.
 */
export function formatMinorUnits(cents: number | bigint, currency: string): string {
  const c = typeof cents === 'bigint' ? Number(cents) : cents;
  const major = c / 100;
  if (!currencySet.has(currency)) {
    return `${major.toFixed(2)} ${currency}`;
  }
  return new Intl.NumberFormat('bs-BA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export { getCurrencyLabel, type CurrencyCode };
