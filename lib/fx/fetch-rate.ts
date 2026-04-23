interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, unknown>;
}

export async function fetchEurQuoteRate(
  date: string,
  currency: string,
): Promise<{ rate: number; rateDate: string; source: 'frankfurter' }> {
  const response = await fetch(
    `https://api.frankfurter.app/${date}?from=EUR&to=${encodeURIComponent(currency)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Frankfurter request failed with status ${String(response.status)}`);
  }

  const payload = (await response.json()) as FrankfurterResponse;
  const rawRate = payload.rates?.[currency];
  if (typeof rawRate !== 'number' || !Number.isFinite(rawRate) || rawRate <= 0) {
    throw new Error('Frankfurter payload missing valid rate');
  }

  return {
    rate: rawRate,
    rateDate: typeof payload.date === 'string' ? payload.date : date,
    source: 'frankfurter',
  };
}
