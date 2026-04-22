export interface FormatMoneyOptions {
  /** @default true */
  showCurrency?: boolean;
}

/**
 * Formats minor units for display. BAM is shown with suffix `KM`; other
 * currencies use the ISO code. Unicode `−` (U+2212) for negative amounts in the numeric part.
 */
export function formatMoney(
  cents: bigint,
  currency: string,
  locale: string,
  options?: FormatMoneyOptions,
): string {
  const show = options?.showCurrency !== false;
  const isNeg = cents < 0n;
  const absCents = isNeg ? -cents : cents;
  if (absCents > 9223372036854775807n) {
    return '—';
  }
  const major = Number(absCents) / 100;

  const numberPart = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);

  const withUnicodeMinus = (isNeg ? '−' : '') + numberPart;
  if (!show) {
    return withUnicodeMinus;
  }
  if (currency === 'BAM') {
    return `${withUnicodeMinus} KM`;
  }
  return `${withUnicodeMinus} ${currency}`;
}
