import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAccount,
  createCashAccount,
  deleteAccount,
  reconcileCashAccount,
  reorderAccounts,
  updateAccount,
} from './actions';
import { CreateAccountSchema } from '@/lib/accounts/validation';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const { convertToBaseMock, computeAccountLedgerCentsMock } = vi.hoisted(() => ({
  convertToBaseMock: vi.fn(),
  computeAccountLedgerCentsMock: vi.fn(),
}));

vi.mock('@/lib/fx/convert', () => ({
  convertToBase: convertToBaseMock,
}));

vi.mock('@/lib/fx/account-ledger', () => ({
  computeAccountLedgerCents: computeAccountLedgerCentsMock,
}));

const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    from,
  })),
}));

interface ChainTerminal {
  data: unknown;
  error: null;
}

function fluent(terminal: ChainTerminal) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
  };
  return chain;
}

describe('CreateAccountSchema', () => {
  it('rejects empty name (validation error)', () => {
    const r = CreateAccountSchema.safeParse({
      name: '',
      type: 'cash',
      currency: 'BAM',
      initial_balance_cents: '0',
      include_in_net_worth: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('createAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReset();
    convertToBaseMock.mockResolvedValue({
      baseCents: 100n,
      fxRate: 1,
      fxRateDate: '2026-01-15',
      fxSource: 'identity',
      fxStale: false,
    });
    // The opening-balance flow asks the ledger helper to convert the initial
    // amount into the account's currency. The mock is permissive: tests that
    // care about the value override it via mockResolvedValueOnce.
    computeAccountLedgerCentsMock.mockResolvedValue(10000n);
  });

  it('returns UNAUTHORIZED when not logged in (auth error)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createAccount({
      name: 'Test',
      type: 'cash',
      currency: 'BAM',
      initial_balance_cents: '0',
      include_in_net_worth: true,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(from).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for invalid input', async () => {
    const result = await createAccount({
      name: '',
      type: 'cash',
      currency: 'BAM',
      initial_balance_cents: '0',
      include_in_net_worth: true,
    });
    expect(result).toEqual(expect.objectContaining({ success: false, error: 'VALIDATION_ERROR' }));
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details.name).toBeDefined();
    }
  });

  it('success: creates account with initial 0, revalidates /racuni', async () => {
    let fromAccounts = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        fromAccounts += 1;
        if (fromAccounts === 1) {
          return fluent({ data: null, error: null });
        }
        if (fromAccounts === 2) {
          return {
            ...fluent({ data: { id: 'acc-new-id' }, error: null }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'acc-new-id' }, error: null }),
              }),
            }),
          };
        }
      }
      throw new Error(`unexpected from(${table}) call (accounts step ${String(fromAccounts)})`);
    });

    const result = await createAccount({
      name: 'Gotovina',
      type: 'cash',
      institution: null,
      currency: 'BAM',
      initial_balance_cents: '0',
      icon: null,
      color: null,
      include_in_net_worth: true,
    });

    expect(result).toEqual({ success: true, data: { id: 'acc-new-id' } });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/racuni');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/pocetna');
  });

  it('success: passes include_in_net_worth false to insert for loan', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'loan-1' }, error: null }),
      }),
    });
    let fromAccounts = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        fromAccounts += 1;
        if (fromAccounts === 1) {
          return fluent({ data: null, error: null });
        }
        if (fromAccounts === 2) {
          return {
            ...fluent({ data: { id: 'loan-1' }, error: null }),
            insert: insertMock,
          };
        }
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await createAccount({
      name: 'Stambeni',
      type: 'loan',
      institution: null,
      currency: 'BAM',
      initial_balance_cents: '0',
      icon: null,
      color: null,
      include_in_net_worth: false,
    });

    expect(result).toEqual({ success: true, data: { id: 'loan-1' } });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'loan', include_in_net_worth: false }),
    );
  });

  it('creates opening transaction with FX conversion when initial balance is non-zero', async () => {
    const txInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    let fromAccounts = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        fromAccounts += 1;
        if (fromAccounts === 1) {
          return fluent({ data: null, error: null });
        }
        if (fromAccounts === 2) {
          return {
            ...fluent({ data: { id: 'acc-open-1' }, error: null }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'acc-open-1' }, error: null }),
              }),
            }),
          };
        }
      }
      if (table === 'categories') {
        return fluent({ data: { id: 'cat-ob' }, error: null });
      }
      if (table === 'profiles') {
        return fluent({ data: { base_currency: 'EUR' }, error: null });
      }
      if (table === 'transactions') {
        return { insert: txInsert };
      }
      throw new Error(`unexpected from(${table})`);
    });

    convertToBaseMock.mockResolvedValue({
      baseCents: 5113n,
      fxRate: 0.51129,
      fxRateDate: '2026-01-15',
      fxSource: 'currency_board',
      fxStale: false,
    });

    const result = await createAccount({
      name: 'Gotovina EUR',
      type: 'cash',
      institution: null,
      currency: 'BAM',
      initial_balance_cents: '10000',
      icon: null,
      color: null,
      include_in_net_worth: true,
    });

    expect(result).toEqual({ success: true, data: { id: 'acc-open-1' } });
    expect(convertToBaseMock).toHaveBeenCalledTimes(1);
    expect(convertToBaseMock).toHaveBeenCalledWith(10000n, 'BAM', 'EUR', expect.any(String));
    expect(txInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acc-open-1',
        original_amount_cents: 10000,
        original_currency: 'BAM',
        base_amount_cents: 5113,
        base_currency: 'EUR',
        account_ledger_cents: 10000,
        fx_rate: 0.51129,
        fx_rate_date: '2026-01-15',
        fx_stale: false,
      }),
    );
  });
});

describe('updateAccount (ownership)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReset();
  });

  it("returns NOT_FOUND when the row is not the current user's (user B on A's account)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-b' } } });

    const id = '123e4567-e89b-12d3-a456-426614174000';
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error('unexpected from');
    });

    const result = await updateAccount(id, { name: 'Hijack' });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await deleteAccount('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('soft deletes owned account', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    let step = 0;
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected table');
      step += 1;
      if (step === 1) return fluent({ data: { id: 'acc1' }, error: null });
      if (step === 2) return fluent({ data: null, error: null });
      throw new Error('unexpected step');
    });

    const result = await deleteAccount('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: true });
  });
});

describe('reorderAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await reorderAccounts(['123e4567-e89b-12d3-a456-426614174000']);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('updates sort order for owned ids', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected table');
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ id: '123e4567-e89b-12d3-a456-426614174000' }],
                  error: null,
                }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      };
    });

    const result = await reorderAccounts(['123e4567-e89b-12d3-a456-426614174000']);
    expect(result).toEqual({ success: true });
  });
});

describe('createCashAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createCashAccount('Gotovina');
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(from).not.toHaveBeenCalled();
  });

  it('short-circuits to ALREADY_EXISTS when a cash account is already present', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error(`unexpected from(${table})`);
      return fluent({ data: { id: 'cash-existing' }, error: null });
    });

    const result = await createCashAccount('Gotovina');
    expect(result).toEqual({
      success: false,
      error: 'ALREADY_EXISTS',
      data: { id: 'cash-existing' },
    });
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
  });

  it('creates a new cash account with base currency and default name', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const insertMock = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'cash-new' }, error: null }),
      }),
    });
    let accountsCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return fluent({ data: { base_currency: 'EUR' }, error: null });
      }
      if (table === 'accounts') {
        accountsCalls += 1;
        // 1st call: existing-cash check (none)
        // 2nd call: max sort_order lookup
        // 3rd call: insert
        if (accountsCalls === 1 || accountsCalls === 2) {
          return fluent({ data: null, error: null });
        }
        if (accountsCalls === 3) {
          return { insert: insertMock };
        }
      }
      throw new Error(`unexpected from(${table}) at step ${String(accountsCalls)}`);
    });

    const result = await createCashAccount(undefined);
    expect(result).toEqual({ success: true, data: { id: 'cash-new' } });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        name: 'Gotovina',
        type: 'cash',
        currency: 'EUR',
        initial_balance_cents: 0,
        current_balance_cents: 0,
        icon: '💵',
        include_in_net_worth: true,
      }),
    );
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/racuni');
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/pocetna');
  });

  it('returns DATABASE_ERROR when the existing-cash query errors', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected table');
      return fluent({ data: null, error: { message: 'boom' } as never });
    });

    const result = await createCashAccount('Gotovina');
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});

describe('reconcileCashAccount', () => {
  const cashId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    convertToBaseMock.mockResolvedValue({
      baseCents: -1500n,
      fxRate: 0.51129,
      fxRateDate: '2026-04-29',
      fxSource: 'currency_board',
      fxStale: false,
    });
    computeAccountLedgerCentsMock.mockResolvedValue(-3000n);
  });

  it('returns VALIDATION_ERROR for malformed input', async () => {
    const result = await reconcileCashAccount({
      account_id: 'not-a-uuid',
      actual_balance_cents: 0n,
    });
    expect(result).toMatchObject({ success: false, error: 'VALIDATION_ERROR' });
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 7000n,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns NOT_FOUND when the account does not exist or is not the user’s', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected');
      return fluent({ data: null, error: null });
    });

    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 7000n,
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('refuses to reconcile when account type is not cash', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected');
      return fluent({
        data: { id: cashId, type: 'checking', currency: 'BAM', current_balance_cents: 10000 },
        error: null,
      });
    });

    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 7000n,
    });
    expect(result).toEqual({ success: false, error: 'NOT_CASH_ACCOUNT' });
  });

  it('returns a no-op success when actual balance equals the ledger', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'accounts') throw new Error('unexpected');
      return fluent({
        data: { id: cashId, type: 'cash', currency: 'BAM', current_balance_cents: 10000 },
        error: null,
      });
    });

    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 10000n,
    });
    expect(result).toEqual({ success: true, data: { transactionId: null, deltaCents: '0' } });
    expect(convertToBaseMock).not.toHaveBeenCalled();
  });

  it('returns CATEGORY_MISSING if the system category is not seeded', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        return fluent({
          data: { id: cashId, type: 'cash', currency: 'BAM', current_balance_cents: 10000 },
          error: null,
        });
      }
      if (table === 'categories') {
        return fluent({ data: null, error: null });
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 7000n,
    });
    expect(result).toEqual({ success: false, error: 'CATEGORY_MISSING' });
  });

  it('posts a Gotovinski troškovi expense when actual < ledger and revalidates views', async () => {
    const txInsert = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'tx-rec-1' }, error: null }),
      }),
    });
    from.mockImplementation((table: string) => {
      if (table === 'accounts') {
        return fluent({
          data: { id: cashId, type: 'cash', currency: 'BAM', current_balance_cents: 10000 },
          error: null,
        });
      }
      if (table === 'categories') {
        return fluent({ data: { id: 'cat-cash-exp' }, error: null });
      }
      if (table === 'profiles') {
        return fluent({ data: { base_currency: 'BAM' }, error: null });
      }
      if (table === 'transactions') {
        return { insert: txInsert };
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await reconcileCashAccount({
      account_id: cashId,
      actual_balance_cents: 7000n,
    });

    expect(result).toMatchObject({
      success: true,
      data: { transactionId: 'tx-rec-1', deltaCents: '-3000' },
    });
    expect(convertToBaseMock).toHaveBeenCalledWith(-3000n, 'BAM', 'BAM', expect.any(String));
    expect(txInsert).toHaveBeenCalledTimes(1);
    const insertedRow = txInsert.mock.calls[0]?.[0] as {
      account_id: string;
      original_amount_cents: number;
      original_currency: string;
      category_id: string;
      category_source: string;
      notes: string;
    };
    expect(insertedRow.account_id).toBe(cashId);
    expect(insertedRow.original_amount_cents).toBe(-3000);
    expect(insertedRow.original_currency).toBe('BAM');
    expect(insertedRow.category_id).toBe('cat-cash-exp');
    expect(insertedRow.category_source).toBe('user');
    expect(insertedRow.notes.startsWith('Usklađivanje gotovine')).toBe(true);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/racuni/${cashId}`);
  });
});
