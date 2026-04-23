import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MaybeSingleResult {
  data: { date: string; rate: number; source: string } | null;
  error: { message: string } | null;
}

const queue: MaybeSingleResult[] = [];
const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
const createClientMock = vi.fn();
const fetchRateMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

vi.mock('./fetch-rate', () => ({
  fetchEurQuoteRate: fetchRateMock,
}));

function makeQueryBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => {
      const next = queue.shift();
      return Promise.resolve(next ?? { data: null, error: null });
    }),
    upsert: upsertMock,
  };
}

const queryBuilder = makeQueryBuilder();
const fromMock = vi.fn().mockReturnValue(queryBuilder);

createClientMock.mockReturnValue({
  from: fromMock,
});

describe('convertToBase default fx store', () => {
  beforeEach(async () => {
    queue.length = 0;
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    const mod = await import('./convert');
    mod.__resetFxInternalsForTests();
  });

  it('uses cached FX rate from fx_rates table', async () => {
    queue.push({
      data: { date: '2026-01-15', rate: 1.3, source: 'ecb' },
      error: null,
    });

    const { convertToBase } = await import('./convert');
    const result = await convertToBase(10000n, 'EUR', 'USD', '2026-01-15');

    expect(result.baseCents).toBe(13000n);
    expect(result.fxSource).toBe('ecb');
    expect(fetchRateMock).not.toHaveBeenCalled();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to stale DB rate when HTTP source fails', async () => {
    queue.push({ data: null, error: null });
    queue.push({
      data: { date: '2026-01-10', rate: 1.2, source: 'frankfurter' },
      error: null,
    });
    fetchRateMock.mockRejectedValue(new Error('network down'));

    const { convertToBase } = await import('./convert');
    const result = await convertToBase(10000n, 'USD', 'EUR', '2026-01-15');

    expect(result.fxStale).toBe(true);
    expect(result.fxSource).toBe('stale');
    expect(result.fxRateDate).toBe('2026-01-10');
  });

  it('persists fetched rate to fx_rates table cache', async () => {
    queue.push({ data: null, error: null });
    fetchRateMock.mockResolvedValue({
      rate: 1.08,
      rateDate: '2026-01-15',
      source: 'frankfurter',
    });

    const { convertToBase } = await import('./convert');
    const result = await convertToBase(10000n, 'EUR', 'USD', '2026-01-15');

    expect(result.baseCents).toBe(10800n);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        date: '2026-01-15',
        base: 'EUR',
        quote: 'USD',
        rate: 1.08,
        source: 'frankfurter',
      },
      { onConflict: 'date,base,quote' },
    );
  });

  it('throws if DB lookup errors and no fallback is available', async () => {
    queue.push({ data: null, error: { message: 'db error' } });
    queue.push({ data: null, error: { message: 'db error' } });
    fetchRateMock.mockRejectedValue(new Error('network down'));

    const { convertToBase } = await import('./convert');
    await expect(convertToBase(10000n, 'USD', 'EUR', '2026-01-15')).rejects.toThrow(
      /FX rate unavailable/u,
    );
  });

  it('converts USD to BAM using EUR pivot and currency board leg', async () => {
    queue.push({
      data: { date: '2026-01-15', rate: 1.25, source: 'ecb' },
      error: null,
    });

    const { convertToBase } = await import('./convert');
    const result = await convertToBase(10000n, 'USD', 'BAM', '2026-01-15');

    expect(result.fxSource).toBe('ecb');
    expect(result.fxStale).toBe(false);
    expect(result.baseCents).toBe(15647n);
  });
});
