import { resolveFxRate } from './convert';

export interface ResolvedFxRate {
  fxRate: number;
  fxRateDate: string;
  fxSource: 'identity' | 'currency_board' | 'ecb' | 'frankfurter' | 'stale';
  fxStale: boolean;
}

interface Row {
  currency: string;
  transaction_date: string;
  /**
   * When the row will be materialised as a transfer-pair, this is the cash
   * account's currency. The resolver pre-fetches the cross rate
   * (source → destCurrency) and the destCurrency → base rate so the to-leg
   * can be priced without an extra round-trip during prepareImportRows.
   */
  destCurrency?: string;
}

export async function resolveFxRatesForBatch(
  rows: Row[],
  baseCurrency: string,
  accountCurrency: string,
): Promise<Map<string, ResolvedFxRate>> {
  const cacheKey = (from: string, to: string, date: string): string => `${from}|${to}|${date}`;
  const keysToResolve = new Set<string>();

  for (const row of rows) {
    const from = row.currency.trim().toUpperCase();
    const base = baseCurrency.trim().toUpperCase();
    const acct = accountCurrency.trim().toUpperCase();

    keysToResolve.add(cacheKey(from, base, row.transaction_date));

    if (from !== acct && base !== acct) {
      keysToResolve.add(cacheKey(from, acct, row.transaction_date));
    }

    if (row.destCurrency) {
      const dest = row.destCurrency.trim().toUpperCase();
      if (dest !== from) {
        keysToResolve.add(cacheKey(from, dest, row.transaction_date));
      }
      if (dest !== base) {
        keysToResolve.add(cacheKey(dest, base, row.transaction_date));
      }
    }
  }

  const cache = new Map<string, ResolvedFxRate>();
  const resolutions = [...keysToResolve].map(async (key) => {
    const [from, to, date] = key.split('|');
    try {
      const rate = await resolveFxRate(from, to, date);
      cache.set(key, rate);
    } catch (error) {
      throw new Error(
        `FX resolution failed for ${from}→${to} on ${date}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  });

  await Promise.all(resolutions);
  return cache;
}
