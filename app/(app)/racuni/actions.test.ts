import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccount, deleteAccount, reorderAccounts, updateAccount } from './actions';
import { CreateAccountSchema } from '@/lib/accounts/validation';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const { convertToBaseMock } = vi.hoisted(() => ({
  convertToBaseMock: vi.fn(),
}));

vi.mock('@/lib/fx/convert', () => ({
  convertToBase: convertToBaseMock,
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
