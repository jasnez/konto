import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccount, CreateAccountSchema, updateAccount } from './actions';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
    });
    expect(r.success).toBe(false);
  });
});

describe('createAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in (auth error)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createAccount({
      name: 'Test',
      type: 'cash',
      currency: 'BAM',
      initial_balance_cents: '0',
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
    });

    expect(result).toEqual({ success: true, data: { id: 'acc-new-id' } });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/racuni');
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
