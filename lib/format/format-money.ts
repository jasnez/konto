export interface FormatMoneyOptions {
  /** @default true */
  showCurrency?: boolean;
}

const MAX_SAFE_CENTS = 9223372036854775807n;

/**
 * Returns true for locales that format numbers as `1,234.56` (comma thousands,
 * period decimal) — i.e., English variants. Everything else is formatted as
 * `1.234,56` (the bs-BA / European convention used by the app).
 *
 * Note: en-IN technically uses Indian numbering (`12,34,567.89`), but no
 * caller in this app passes en-IN so we don't special-case it.
 */
function usesEnglishNumberFormat(locale: string): boolean {
  const l = locale.toLowerCase();
  return l === 'en' || l.startsWith('en-') || l.startsWith('en_');
}

function groupThousands(intStr: string, separator: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats minor units for display. BAM is shown with suffix `KM`; other
 * currencies use the ISO code. Unicode `−` (U+2212) for negative amounts.
 *
 * Uses manual formatting (not `Intl.NumberFormat`) so SSR and CSR produce
 * byte-identical output regardless of the host runtime's ICU build — some
 * Next.js server runtimes ship with limited ICU and silently fall back to
 * `en-US` for `bs-BA`, which used to cause hydration mismatches.
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
  if (absCents > MAX_SAFE_CENTS) {
    return '—';
  }

  const intPart = absCents / 100n;
  const fracPart = absCents % 100n;
  const fracStr = fracPart < 10n ? `0${String(fracPart)}` : String(fracPart);

  const enFormat = usesEnglishNumberFormat(locale);
  const thousandSep = enFormat ? ',' : '.';
  const decimalSep = enFormat ? '.' : ',';

  const intWithSeps = groupThousands(String(intPart), thousandSep);
  const numberPart = `${intWithSeps}${decimalSep}${fracStr}`;
  const withUnicodeMinus = (isNeg ? '−' : '') + numberPart;

  if (!show) {
    return withUnicodeMinus;
  }
  if (currency === 'BAM') {
    return `${withUnicodeMinus} KM`;
  }
  return `${withUnicodeMinus} ${currency}`;
}
