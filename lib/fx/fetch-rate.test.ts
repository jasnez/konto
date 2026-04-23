import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEurQuoteRate } from './fetch-rate';

describe('fetchEurQuoteRate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed rate from Frankfurter payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            date: '2026-01-15',
            rates: { USD: 1.0812 },
          }),
      }),
    );

    const result = await fetchEurQuoteRate('2026-01-15', 'USD');
    expect(result).toEqual({
      rate: 1.0812,
      rateDate: '2026-01-15',
      source: 'frankfurter',
    });
  });

  it('falls back to requested date when payload omits date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ rates: { USD: 1.09 } }),
      }),
    );

    const result = await fetchEurQuoteRate('2026-02-01', 'USD');
    expect(result.rateDate).toBe('2026-02-01');
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(fetchEurQuoteRate('2026-01-15', 'USD')).rejects.toThrow(/status 500/u);
  });

  it('throws on malformed payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ date: '2026-01-15', rates: { USD: 'NaN' } }),
      }),
    );

    await expect(fetchEurQuoteRate('2026-01-15', 'USD')).rejects.toThrow(/missing valid rate/u);
  });
});
