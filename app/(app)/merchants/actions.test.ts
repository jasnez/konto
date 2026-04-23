import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchMerchants } from './actions';

const getUser = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    rpc,
  })),
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
