import { convertToBase } from '@/lib/fx/convert';

/**
 * Signed amount in **account currency** for balance: prefer original or base
 * when their currency matches the account; otherwise convert from original
 * to the account currency (e.g. profile base is EUR, account is BAM, receipt in SEK).
 */
export async function computeAccountLedgerCents(
  accountCurrency: string,
  originalCents: bigint,
  originalCurrency: string,
  baseCents: bigint,
  baseCurrency: string,
  transactionDate: string,
): Promise<bigint> {
  const acc = accountCurrency.trim().toUpperCase();
  if (originalCurrency.trim().toUpperCase() === acc) {
    return originalCents;
  }
  if (baseCurrency.trim().toUpperCase() === acc) {
    return baseCents;
  }
  const { baseCents: converted } = await convertToBase(
    originalCents,
    originalCurrency,
    accountCurrency,
    transactionDate,
  );
  return converted;
}
