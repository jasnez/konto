import { describe, expect, it, vi } from 'vitest';
import { prepareImportRows } from '@/lib/server/imports/finalize-pipeline';
import type { FinalizeContext, StagingRow } from '@/lib/server/imports/finalize-types';
import type { ResolvedFxRate } from '@/lib/fx/batch-resolver';

const baseStaging: StagingRow = {
  id: 'parsed-1',
  transaction_date: '2026-04-10',
  amount_minor: -2500,
  currency: 'EUR',
  raw_description: 'KONZUM',
  merchant_id: null,
  category_id: null,
  categorization_source: null,
  categorization_confidence: null,
};

function makeCtx(overrides?: Partial<FinalizeContext>): FinalizeContext {
  return {
    batch: {
      id: 'batch-1',
      status: 'ready',
      account_id: 'acct-1',
      storage_path: null,
    },
    baseCurrency: 'BAM',
    accountCurrency: 'BAM',
    staging: [baseStaging],
    ...overrides,
  };
}

describe('prepareImportRows — FX resolver DI seam', () => {
  it('uses injected fxResolver instead of the default', async () => {
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> =>
        Promise.resolve(
          new Map([
            [
              'EUR|BAM|2026-04-10',
              {
                fxRate: 1.95583,
                fxRateDate: '2026-04-10',
                fxSource: 'currency_board',
                fxStale: false,
              },
            ],
          ]),
        ),
    );

    const result = await prepareImportRows(makeCtx(), 'user-1', { fxResolver: fakeFx });

    expect(fakeFx).toHaveBeenCalledOnce();
    expect(fakeFx).toHaveBeenCalledWith([baseStaging], 'BAM', 'BAM');
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]).toMatchObject({
      original_amount_cents: -2500,
      original_currency: 'EUR',
      base_currency: 'BAM',
      fx_rate: 1.95583,
      fx_rate_date: '2026-04-10',
      fx_stale: false,
      transaction_date: '2026-04-10',
      merchant_raw: 'KONZUM',
    });
  });

  it('propagates EXTERNAL_SERVICE_ERROR when injected fxResolver throws', async () => {
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> => Promise.reject(new Error('FX provider down')),
    );

    const result = await prepareImportRows(makeCtx(), 'user-1', { fxResolver: fakeFx });

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' });
  });

  it('returns EXTERNAL_SERVICE_ERROR when injected resolver omits a needed key', async () => {
    // Resolver returns empty cache — base FX lookup fails.
    const fakeFx = vi.fn((): Promise<Map<string, ResolvedFxRate>> => Promise.resolve(new Map()));

    const result = await prepareImportRows(makeCtx(), 'user-1', { fxResolver: fakeFx });

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' });
  });

  it('handles cross-currency ledger conversion via injected resolver', async () => {
    // base = EUR, account = BAM, tx in USD. Needs both USD|EUR and USD|BAM keys.
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> =>
        Promise.resolve(
          new Map([
            [
              'USD|EUR|2026-04-10',
              { fxRate: 0.92, fxRateDate: '2026-04-10', fxSource: 'ecb', fxStale: false },
            ],
            [
              'USD|BAM|2026-04-10',
              { fxRate: 1.8, fxRateDate: '2026-04-10', fxSource: 'ecb', fxStale: false },
            ],
          ]),
        ),
    );

    const usdStaging: StagingRow = { ...baseStaging, currency: 'USD', amount_minor: -1000 };
    const result = await prepareImportRows(
      makeCtx({ baseCurrency: 'EUR', accountCurrency: 'BAM', staging: [usdStaging] }),
      'user-1',
      { fxResolver: fakeFx },
    );

    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.prepared[0].base_amount_cents).toBe(-920);
    expect(result.prepared[0].account_ledger_cents).toBe(-1800);
  });
});
