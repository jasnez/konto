import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAM_EUR_RATE } from './constants';
import type { FxRateStore } from './convert';
import { __resetFxInternalsForTests, __setFxRateStoreForTests, convertToBase } from './convert';
import { fetchEurQuoteRate } from './fetch-rate';

vi.mock('./fetch-rate', () => ({
  fetchEurQuoteRate: vi.fn(),
}));

interface FxSeed {
  date: string;
  quote: string;
  rate: number;
  source: 'ecb' | 'frankfurter';
}

function createMemoryStore(seed: FxSeed[] = []): FxRateStore {
  const rows = new Map<string, FxSeed>();
  for (const item of seed) {
    rows.set(`${item.quote}|${item.date}`, item);
  }

  return {
    getRateOnDate(date, quote) {
      const hit = rows.get(`${quote}|${date}`);
      if (!hit) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        rate: hit.rate,
        rateDate: hit.date,
        source: hit.source,
      });
    },

    getLatestRateBeforeDate(date, quote) {
      const keys = [...rows.values()]
        .filter((entry) => entry.quote === quote && entry.date < date)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = keys.at(0);
      if (!latest) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        rate: latest.rate,
        rateDate: latest.date,
        source: latest.source,
      });
    },

    saveRate(entry) {
      rows.set(`${entry.quote}|${entry.date}`, {
        date: entry.date,
        quote: entry.quote,
        rate: entry.rate,
        source: entry.source,
      });
      return Promise.resolve();
    },
  };
}

describe('convertToBase', () => {
  const mockedFetch = vi.mocked(fetchEurQuoteRate);

  beforeEach(() => {
    vi.clearAllMocks();
    __resetFxInternalsForTests();
    __setFxRateStoreForTests(createMemoryStore());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('identity: same currency returns same amount', async () => {
    const result = await convertToBase(1000n, 'EUR', 'EUR', '2026-01-15');
    expect(result.baseCents).toBe(1000n);
    expect(result.fxRate).toBe(1);
    expect(result.fxStale).toBe(false);
    expect(result.fxSource).toBe('identity');
  });

  it('BAM to EUR uses currency board constant', async () => {
    const result = await convertToBase(10000n, 'BAM', 'EUR', '2026-01-15');
    expect(result.baseCents).toBe(5113n);
    expect(result.fxRate).toBeCloseTo(1 / BAM_EUR_RATE, 6);
    expect(result.fxSource).toBe('currency_board');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('EUR to BAM uses currency board constant', async () => {
    const result = await convertToBase(10000n, 'EUR', 'BAM', '2026-01-15');
    expect(result.baseCents).toBe(19558n);
    expect(result.fxRate).toBeCloseTo(BAM_EUR_RATE, 6);
    expect(result.fxSource).toBe('currency_board');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('BAM to USD goes through EUR', async () => {
    mockedFetch.mockResolvedValue({
      rate: 1.1,
      rateDate: '2026-01-15',
      source: 'frankfurter',
    });

    const result = await convertToBase(10000n, 'BAM', 'USD', '2026-01-15');

    expect(Number(result.baseCents)).toBeCloseTo(5624, 0);
    expect(result.fxSource).toBe('frankfurter');
    expect(result.fxStale).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith('2026-01-15', 'USD');
  });

  it('flags stale when rate unavailable', async () => {
    __setFxRateStoreForTests(
      createMemoryStore([{ date: '2026-01-10', quote: 'USD', rate: 1.2, source: 'ecb' }]),
    );
    mockedFetch.mockRejectedValue(new Error('network down'));

    const result = await convertToBase(10000n, 'USD', 'EUR', '2026-01-15');
    expect(result.baseCents).toBe(8333n);
    expect(result.fxStale).toBe(true);
    expect(result.fxSource).toBe('stale');
    expect(result.fxRateDate).toBe('2026-01-10');
  });

  it('uses stale leg date when stale rate is on target leg', async () => {
    __setFxRateStoreForTests(
      createMemoryStore([{ date: '2026-01-10', quote: 'USD', rate: 1.2, source: 'ecb' }]),
    );
    mockedFetch.mockRejectedValue(new Error('network down'));

    const result = await convertToBase(10000n, 'EUR', 'USD', '2026-01-15');
    expect(result.fxStale).toBe(true);
    expect(result.fxRateDate).toBe('2026-01-10');
  });

  it('uses date-specific rate, not current', async () => {
    __setFxRateStoreForTests(
      createMemoryStore([
        { date: '2020-01-15', quote: 'USD', rate: 1.1, source: 'ecb' },
        { date: '2026-04-21', quote: 'USD', rate: 1.25, source: 'ecb' },
      ]),
    );

    const historical = await convertToBase(10000n, 'USD', 'EUR', '2020-01-15');
    const today = await convertToBase(10000n, 'USD', 'EUR', '2026-04-21');

    expect(historical.fxRateDate).toBe('2020-01-15');
    expect(today.fxRateDate).toBe('2026-04-21');
    expect(historical.fxRate).not.toBe(today.fxRate);
  });

  it('caches Frankfurter response for next conversion', async () => {
    const store = createMemoryStore();
    __setFxRateStoreForTests(store);
    mockedFetch.mockResolvedValue({
      rate: 1.18,
      rateDate: '2026-01-20',
      source: 'frankfurter',
    });

    const first = await convertToBase(10000n, 'EUR', 'USD', '2026-01-20');
    const second = await convertToBase(10000n, 'EUR', 'USD', '2026-01-20');

    expect(first.baseCents).toBe(11800n);
    expect(second.baseCents).toBe(11800n);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('throws if no fresh or stale rate can be resolved', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'));
    await expect(convertToBase(10000n, 'USD', 'EUR', '2026-01-15')).rejects.toThrow(
      /FX rate unavailable/u,
    );
  });

  it('rejects invalid date format', async () => {
    await expect(convertToBase(10000n, 'USD', 'EUR', '15-01-2026')).rejects.toThrow(
      /ISO yyyy-mm-dd/u,
    );
  });

  it('works with default store when DB env is not available', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    __setFxRateStoreForTests(null);
    mockedFetch.mockResolvedValue({
      rate: 1.09,
      rateDate: '2026-01-15',
      source: 'frankfurter',
    });

    const result = await convertToBase(10000n, 'EUR', 'USD', '2026-01-15');
    expect(result.baseCents).toBe(10900n);
    expect(result.fxSource).toBe('frankfurter');
  });

  it('throws with default store when API fails and no stale cache exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    __setFxRateStoreForTests(null);
    mockedFetch.mockRejectedValue(new Error('offline'));

    await expect(convertToBase(10000n, 'USD', 'EUR', '2026-01-15')).rejects.toThrow(
      /FX rate unavailable/u,
    );
  });

  it('uses latest available rate date when fresh response is older', async () => {
    mockedFetch.mockResolvedValue({
      rate: 1.2,
      rateDate: '2026-01-10',
      source: 'frankfurter',
    });

    const result = await convertToBase(10000n, 'USD', 'EUR', '2026-01-15');
    expect(result.fxRateDate).toBe('2026-01-15');
  });
});
