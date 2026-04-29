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
  convert_to_transfer_to_account_id: null,
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
    destAccountCurrencies: new Map(),
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
    // The pipeline now passes a slimmed-down row shape (currency,
    // transaction_date, destCurrency) so the resolver knows whether to
    // pre-fetch transfer-pair cross rates as well.
    expect(fakeFx).toHaveBeenCalledWith(
      [
        {
          currency: baseStaging.currency,
          transaction_date: baseStaging.transaction_date,
          destCurrency: undefined,
        },
      ],
      'BAM',
      'BAM',
    );
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

describe('prepareImportRows — transfer-pair conversion', () => {
  it('builds same-currency to-leg amounts (BAM bank → BAM cash)', async () => {
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> =>
        Promise.resolve(
          new Map([
            [
              'BAM|BAM|2026-04-10',
              { fxRate: 1, fxRateDate: '2026-04-10', fxSource: 'identity', fxStale: false },
            ],
          ]),
        ),
    );

    const atmRow: StagingRow = {
      ...baseStaging,
      currency: 'BAM',
      amount_minor: -10000,
      raw_description: 'BANKOMAT ISPLATA',
      convert_to_transfer_to_account_id: 'cash-1',
    };

    const result = await prepareImportRows(
      makeCtx({
        staging: [atmRow],
        destAccountCurrencies: new Map([['cash-1', 'BAM']]),
      }),
      'user-1',
      { fxResolver: fakeFx },
    );

    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const r = result.prepared[0];
    expect(r.to_account_id).toBe('cash-1');
    expect(r.original_amount_cents).toBe(-10000);
    expect(r.account_ledger_cents).toBe(-10000);
    // To-leg credits the cash account by the absolute value, same currency.
    expect(r.to_original_currency).toBe('BAM');
    expect(r.to_original_amount_cents).toBe(10000);
    expect(r.to_account_ledger_cents).toBe(10000);
    expect(r.to_fx_rate).toBe(1);
    expect(r.to_fx_stale).toBe(false);
    // Transfers are uncategorised at the data layer.
    expect(r.category_id).toBeNull();
    expect(r.category_source).toBeNull();
  });

  it('cross-currency: BAM bank → EUR cash uses cross rate for to-leg amount', async () => {
    // Source amount: -1000 BAM cents (10 BAM withdrawn).
    // Cash account: EUR. Cross rate BAM→EUR = 0.51129 → 511 EUR cents.
    // Base = EUR, so to-leg base equals to-leg amount and rate = 1.
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> =>
        Promise.resolve(
          new Map([
            [
              'BAM|EUR|2026-04-10',
              {
                fxRate: 0.51129,
                fxRateDate: '2026-04-10',
                fxSource: 'currency_board',
                fxStale: false,
              },
            ],
          ]),
        ),
    );

    const atmRow: StagingRow = {
      ...baseStaging,
      currency: 'BAM',
      amount_minor: -1000,
      convert_to_transfer_to_account_id: 'cash-eur',
    };

    const result = await prepareImportRows(
      makeCtx({
        baseCurrency: 'EUR',
        accountCurrency: 'BAM',
        staging: [atmRow],
        destAccountCurrencies: new Map([['cash-eur', 'EUR']]),
      }),
      'user-1',
      { fxResolver: fakeFx },
    );

    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    const r = result.prepared[0];
    expect(r.to_account_id).toBe('cash-eur');
    expect(r.to_original_currency).toBe('EUR');
    // 1000 cents × 0.51129 = 511.29 → rounded to 511 cents.
    expect(r.to_original_amount_cents).toBe(511);
    // EUR-denominated to-leg, base also EUR, so base equals amount.
    expect(r.to_base_amount_cents).toBe(511);
    expect(r.to_fx_rate).toBe(1);
  });

  it('falls through EXTERNAL_SERVICE_ERROR when to-leg cross rate is missing', async () => {
    // Source-side rate present, cross rate missing → resolver omitted it.
    const fakeFx = vi.fn(
      (): Promise<Map<string, ResolvedFxRate>> =>
        Promise.resolve(
          new Map([
            [
              'BAM|EUR|2026-04-10',
              {
                fxRate: 0.51129,
                fxRateDate: '2026-04-10',
                fxSource: 'currency_board',
                fxStale: false,
              },
            ],
          ]),
        ),
    );

    const atmRow: StagingRow = {
      ...baseStaging,
      currency: 'BAM',
      amount_minor: -1000,
      convert_to_transfer_to_account_id: 'cash-usd',
    };

    const result = await prepareImportRows(
      makeCtx({
        baseCurrency: 'EUR',
        accountCurrency: 'BAM',
        staging: [atmRow],
        // Dest currency known but BAM→USD cross rate not in cache.
        destAccountCurrencies: new Map([['cash-usd', 'USD']]),
      }),
      'user-1',
      { fxResolver: fakeFx },
    );

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' });
  });
});
