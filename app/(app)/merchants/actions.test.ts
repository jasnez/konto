import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMerchant, deleteMerchant, searchMerchants, updateMerchant } from './actions';
import { createClient } from '@/lib/supabase/server';

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const sampleKonzum = {
  id: 'm1',
  canonical_name: 'Konzum',
  display_name: 'Konzum',
  default_category_id: null,
  icon: '🛒',
  color: null,
  transaction_count: 3,
  similarity_score: 0.42,
};

const sampleHifa = {
  id: 'm2',
  canonical_name: 'Hifa-Oil',
  display_name: 'Hifa-Oil',
  default_category_id: null,
  icon: '⛽',
  color: null,
  transaction_count: 1,
  similarity_score: 0.38,
};

describe('searchMerchants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    rpc.mockReset();
    from.mockReset();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser },
      rpc,
      from,
    } as never);
  });

  it('returns empty list for blank query without calling RPC', async () => {
    const result = await searchMerchants('   ', 5);
    expect(result).toEqual({ success: true, data: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await searchMerchants('konz', 5);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC rows for fuzzy query 'konz' (e.g. Konzum)", async () => {
    rpc.mockResolvedValue({ data: [sampleKonzum], error: null });

    const result = await searchMerchants('konz', 5);

    expect(rpc).toHaveBeenCalledWith('search_merchants', { p_query: 'konz', p_limit: 5 });
    expect(result).toEqual({
      success: true,
      data: [
        {
          id: 'm1',
          canonical_name: 'Konzum',
          display_name: 'Konzum',
          default_category_id: null,
          icon: '🛒',
          color: null,
          transaction_count: 3,
          similarity_score: 0.42,
        },
      ],
    });
  });

  it("maps RPC rows for query 'hifa' (e.g. Hifa-Oil)", async () => {
    rpc.mockResolvedValue({ data: [sampleHifa], error: null });

    const result = await searchMerchants('hifa', 5);

    expect(rpc).toHaveBeenCalledWith('search_merchants', { p_query: 'hifa', p_limit: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.canonical_name).toBe('Hifa-Oil');
    }
  });

  it('returns DATABASE_ERROR when RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await searchMerchants('x', 3);

    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});

describe('merchant CRUD actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    rpc.mockReset();
  });

  it('createMerchant returns UNAUTHORIZED without user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await createMerchant({
      canonical_name: 'Konzum',
      display_name: 'Konzum',
      default_category_id: null,
      icon: null,
      color: null,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('createMerchant succeeds for valid input', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'categories') {
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
      if (table === 'merchants') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'm-new' }, error: null }),
            }),
          }),
        };
      }
      throw new Error('unexpected table');
    });

    const result = await createMerchant({
      canonical_name: 'Konzum',
      display_name: 'Konzum',
      default_category_id: '123e4567-e89b-12d3-a456-426614174000',
      icon: null,
      color: null,
    });
    expect(result).toEqual({ success: true, data: { id: 'm-new' } });
  });

  it('updateMerchant returns NOT_FOUND for non-owned merchant', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'merchants') throw new Error('unexpected table');
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
    });

    const result = await updateMerchant('123e4567-e89b-12d3-a456-426614174000', {
      display_name: 'Novi',
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('deleteMerchant blocks when merchant has transactions', async () => {
    from.mockImplementation((table: string) => {
      if (table !== 'merchants') throw new Error('unexpected table');
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: 'm1', transaction_count: 2 }, error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const result = await deleteMerchant('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: false, error: 'MERCHANT_HAS_TRANSACTIONS' });
  });
});
