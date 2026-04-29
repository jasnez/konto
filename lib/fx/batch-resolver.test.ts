import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveFxRatesForBatch, type ResolvedFxRate } from './batch-resolver';
import * as convert from './convert';

vi.mock('./convert', async () => {
  const actual = await vi.importActual('./convert');
  return actual;
});

describe('resolveFxRatesForBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates and resolves unique (from, to, date) pairs', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    resolveFxRateMock.mockResolvedValue({
      fxRate: 1.5,
      fxRateDate: '2026-04-28',
      fxSource: 'ecb',
      fxStale: false,
    });

    const rows = [
      { currency: 'USD', transaction_date: '2026-04-28' },
      { currency: 'USD', transaction_date: '2026-04-28' },
      { currency: 'EUR', transaction_date: '2026-04-28' },
    ];

    const cache = await resolveFxRatesForBatch(rows, 'EUR', 'BAM');

    expect(resolveFxRateMock).toHaveBeenCalledTimes(4);
    expect(cache.get('USD|EUR|2026-04-28')).toBeDefined();
    expect(cache.get('USD|BAM|2026-04-28')).toBeDefined();
    expect(cache.get('EUR|EUR|2026-04-28')).toBeDefined();
    expect(cache.get('EUR|BAM|2026-04-28')).toBeDefined();
  });

  it('skips ledger resolution when account currency matches original or base', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    resolveFxRateMock.mockResolvedValue({
      fxRate: 1.0,
      fxRateDate: '2026-04-28',
      fxSource: 'identity',
      fxStale: false,
    });

    const rows = [
      { currency: 'EUR', transaction_date: '2026-04-28' }, // original === account
      { currency: 'USD', transaction_date: '2026-04-28' }, // base === account
    ];

    const cache = await resolveFxRatesForBatch(rows, 'EUR', 'EUR');

    expect(resolveFxRateMock).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it('propagates resolve errors with descriptive message', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    resolveFxRateMock.mockRejectedValue(new Error('FX rate unavailable for EUR/XYZ'));

    const rows = [{ currency: 'USD', transaction_date: '2026-04-28' }];

    await expect(resolveFxRatesForBatch(rows, 'EUR', 'BAM')).rejects.toThrow(
      /FX resolution failed for USD→EUR on 2026-04-28/,
    );
  });

  it('handles whitespace in currency codes', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    resolveFxRateMock.mockResolvedValue({
      fxRate: 2.0,
      fxRateDate: '2026-04-28',
      fxSource: 'ecb',
      fxStale: false,
    });

    const rows = [{ currency: ' USD ', transaction_date: '2026-04-28' }];

    const cache = await resolveFxRatesForBatch(rows, ' EUR ', ' BAM ');

    expect(resolveFxRateMock).toHaveBeenCalledWith('USD', 'EUR', '2026-04-28');
    expect(cache.get('USD|EUR|2026-04-28')).toBeDefined();
  });

  it('returns cache keys in format from|to|date', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    const rate: ResolvedFxRate = {
      fxRate: 1.2,
      fxRateDate: '2026-04-28',
      fxSource: 'ecb',
      fxStale: false,
    };
    resolveFxRateMock.mockResolvedValue(rate);

    const rows = [{ currency: 'USD', transaction_date: '2026-04-28' }];
    const cache = await resolveFxRatesForBatch(rows, 'EUR', 'BAM');

    const key = 'USD|EUR|2026-04-28';
    expect(cache.has(key)).toBe(true);
    expect(cache.get(key)).toEqual(rate);
  });

  it('handles identity case (same from and to currency)', async () => {
    const resolveFxRateMock = vi.spyOn(convert, 'resolveFxRate');
    resolveFxRateMock.mockResolvedValue({
      fxRate: 1.0,
      fxRateDate: '2026-04-28',
      fxSource: 'identity',
      fxStale: false,
    });

    const rows = [{ currency: 'EUR', transaction_date: '2026-04-28' }];
    const cache = await resolveFxRatesForBatch(rows, 'EUR', 'BAM');

    expect(resolveFxRateMock).toHaveBeenCalledWith('EUR', 'EUR', '2026-04-28');
    expect(cache.get('EUR|EUR|2026-04-28')?.fxRate).toBe(1.0);
  });
});
