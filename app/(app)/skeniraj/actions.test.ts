import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { resolveMerchantForReceipt } from '@/lib/merchants/resolve-merchant';
import { convertToBase } from '@/lib/fx/convert';
import { computeAccountLedgerCents } from '@/lib/fx/account-ledger';
import { createTransactionFromReceipt } from './actions';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/merchants/resolve-merchant', () => ({
  resolveMerchantForReceipt: vi.fn(),
}));

vi.mock('@/lib/fx/convert', () => ({
  convertToBase: vi.fn(),
}));

vi.mock('@/lib/fx/account-ledger', () => ({
  computeAccountLedgerCents: vi.fn(),
}));

vi.mock('@/lib/dedup', () => ({
  computeDedupHash: vi.fn(() => 'fake-hash'),
}));

vi.mock('@/lib/logger', () => ({
  logSafe: vi.fn(),
  logWarn: vi.fn(),
}));

const VALID_INPUT = {
  scan_id: '123e4567-e89b-12d3-a456-426614174000',
  account_id: '123e4567-e89b-12d3-a456-426614174001',
  amount_cents: 1234n,
  currency: 'BAM',
  transaction_date: '2026-05-03',
  merchant_raw: 'Konzum',
  category_id: null,
  notes: null,
};

interface FakeSupabaseConfig {
  scan?: { id: string; user_id: string; status: string; transaction_id: string | null } | null;
  account?: { id: string; user_id: string; currency: string; is_active: boolean } | null;
  profile?: { base_currency: string } | null;
  txInsert?: { id: string } | null;
  txInsertError?: { message: string } | null;
}

function makeSupabase(cfg: FakeSupabaseConfig = {}) {
  const scan =
    cfg.scan === undefined
      ? { id: VALID_INPUT.scan_id, user_id: 'u1', status: 'extracted', transaction_id: null }
      : cfg.scan;
  const account =
    cfg.account === undefined
      ? { id: VALID_INPUT.account_id, user_id: 'u1', currency: 'BAM', is_active: true }
      : cfg.account;
  const profile = cfg.profile === undefined ? { base_currency: 'BAM' } : cfg.profile;
  const txInsert = cfg.txInsert === undefined ? { id: 'tx-1' } : cfg.txInsert;

  const txInsertCall = vi.fn();
  const scanLinkUpdate = vi.fn(() => ({
    eq: () => ({
      eq: () => Promise.resolve({ data: null, error: null }),
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table === 'receipt_scans') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: scan, error: null }),
          }),
        }),
        update: scanLinkUpdate,
      };
    }
    if (table === 'accounts') {
      // MT-12: ownership check switched to ensureOwnedAccount helper which
      // does .select().eq(id).eq(user_id).is(deleted_at).maybeSingle().
      // Mock now has TWO .eq() in the chain.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: () => Promise.resolve({ data: account, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: profile, error: null }),
          }),
        }),
      };
    }
    if (table === 'transactions') {
      return {
        insert: (payload: unknown) => {
          txInsertCall(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: txInsert,
                  error: cfg.txInsertError ?? null,
                }),
            }),
          };
        },
      };
    }
    if (table === 'categories') {
      // MT-12: ownership check switched to ensureOwnedCategory helper which
      // does .select().eq(id).eq(user_id).is(deleted_at).maybeSingle().
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'cat1' }, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  const getUser = vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } }));
  const client = { auth: { getUser }, from };

  return {
    client: client as never,
    getUser,
    txInsertCall,
    scanLinkUpdate,
  };
}

describe('createTransactionFromReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -1234n,
      fxRate: 1,
      fxRateDate: '2026-05-03',
      fxStale: false,
    } as never);
    vi.mocked(computeAccountLedgerCents).mockResolvedValue(-1234n);
    vi.mocked(resolveMerchantForReceipt).mockResolvedValue({
      merchantId: 'm-existing',
      created: false,
    });
  });

  it('passes resolved merchant_id into the transactions insert payload', async () => {
    const { client, txInsertCall } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(resolveMerchantForReceipt).toHaveBeenCalledWith(client, 'u1', 'Konzum');
    expect(txInsertCall).toHaveBeenCalledTimes(1);
    expect(txInsertCall.mock.calls[0]?.[0]).toMatchObject({
      merchant_id: 'm-existing',
      merchant_raw: 'Konzum',
    });
  });

  it('returns merchantId + merchantCreated when a new merchant is created', async () => {
    vi.mocked(resolveMerchantForReceipt).mockResolvedValue({
      merchantId: 'm-fresh',
      created: true,
    });
    const { client } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result).toEqual({
      success: true,
      data: { transactionId: 'tx-1', merchantId: 'm-fresh', merchantCreated: true },
    });
  });

  it('saves transaction with merchant_id null when merchant_raw is null', async () => {
    vi.mocked(resolveMerchantForReceipt).mockResolvedValue({ merchantId: null, created: false });
    const { client, txInsertCall } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt({ ...VALID_INPUT, merchant_raw: null });

    expect(result.success).toBe(true);
    expect(resolveMerchantForReceipt).toHaveBeenCalledWith(client, 'u1', null);
    expect(txInsertCall.mock.calls[0]?.[0]).toMatchObject({
      merchant_id: null,
      merchant_raw: null,
    });
  });

  it('returns idempotent shape (null/false) when scan already linked', async () => {
    const { client } = makeSupabase({
      scan: {
        id: VALID_INPUT.scan_id,
        user_id: 'u1',
        status: 'extracted',
        transaction_id: 'tx-prev',
      },
    });
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result).toEqual({
      success: true,
      data: { transactionId: 'tx-prev', merchantId: null, merchantCreated: false },
    });
    expect(resolveMerchantForReceipt).not.toHaveBeenCalled();
  });

  it('still saves the transaction even when resolver returns null', async () => {
    vi.mocked(resolveMerchantForReceipt).mockResolvedValue({ merchantId: null, created: false });
    const { client, txInsertCall } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(txInsertCall.mock.calls[0]?.[0]).toMatchObject({ merchant_id: null });
  });

  it('returns DATABASE_ERROR when transaction insert fails (merchant already resolved)', async () => {
    const { client } = makeSupabase({ txInsertError: { message: 'boom' } });
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });

  it('returns UNAUTHORIZED when user is not logged in', async () => {
    const { client, getUser } = makeSupabase();
    getUser.mockResolvedValueOnce({ data: { user: null } } as never);
    vi.mocked(createClient).mockResolvedValue(client);

    const result = await createTransactionFromReceipt(VALID_INPUT);

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(resolveMerchantForReceipt).not.toHaveBeenCalled();
  });
});
