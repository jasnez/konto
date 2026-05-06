import { describe, expect, it, vi } from 'vitest';
import { getSpendingByCategory, type SpendingSupabaseClient } from './spending-by-category';

interface RpcRowFixture {
  category_id: string | null;
  category_name: string;
  category_icon: string;
  category_color: string | null;
  category_slug: string;
  amount_cents: number | string | null;
  prev_amount_cents: number | string | null;
  monthly_history: (number | string)[] | null;
}

function makeClient(
  rows: RpcRowFixture[] | null,
  error: { message: string } | null = null,
): { client: SpendingSupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(() => Promise.resolve({ data: rows, error }));
  return { client: { rpc: rpc as never }, rpc };
}

const sampleRow: RpcRowFixture = {
  category_id: 'cat-1',
  category_name: 'Hrana',
  category_icon: '🍔',
  category_color: '#10b981',
  category_slug: 'hrana',
  amount_cents: 12500,
  prev_amount_cents: 9000,
  monthly_history: [0, 0, 0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 9000, 12500],
};

describe('getSpendingByCategory', () => {
  it('passes RPC params through verbatim', async () => {
    const { client, rpc } = makeClient([]);
    await getSpendingByCategory(client, {
      period: 'monthly',
      offset: 0,
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(rpc).toHaveBeenCalledWith('get_spending_by_category', {
      p_period: 'monthly',
      p_offset: 0,
      p_base_currency: 'BAM',
      p_today_date: '2026-05-06',
    });
  });

  it('defaults offset to 0 when omitted', async () => {
    const { client, rpc } = makeClient([]);
    await getSpendingByCategory(client, {
      period: 'weekly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_offset: 0 });
  });

  it('converts cents fields and history entries to bigint', async () => {
    const { client } = makeClient([sampleRow]);
    const result = await getSpendingByCategory(client, {
      period: 'monthly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.amountCents).toBe(12500n);
    expect(result[0]?.prevAmountCents).toBe(9000n);
    expect(result[0]?.monthlyHistory).toHaveLength(12);
    expect(result[0]?.monthlyHistory.every((v) => typeof v === 'bigint')).toBe(true);
    expect(result[0]?.monthlyHistory[11]).toBe(12500n);
    expect(result[0]?.monthlyHistory[0]).toBe(0n);
  });

  it('returns empty list on RPC error', async () => {
    const { client } = makeClient(null, { message: 'connection lost' });
    const result = await getSpendingByCategory(client, {
      period: 'monthly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(result).toEqual([]);
  });

  it('falls back to twelve zeroes when monthly_history is null', async () => {
    const { client } = makeClient([{ ...sampleRow, monthly_history: null }]);
    const result = await getSpendingByCategory(client, {
      period: 'monthly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(result[0]?.monthlyHistory).toHaveLength(12);
    expect(result[0]?.monthlyHistory.every((v) => v === 0n)).toBe(true);
  });

  it('left-pads short histories and trims long ones', async () => {
    const { client } = makeClient([
      { ...sampleRow, monthly_history: [1, 2, 3] }, // short → pad
    ]);
    const short = await getSpendingByCategory(client, {
      period: 'monthly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(short[0]?.monthlyHistory).toHaveLength(12);
    // padded zeros at the front, original at the tail
    expect(short[0]?.monthlyHistory.slice(-3)).toEqual([1n, 2n, 3n]);
    expect(short[0]?.monthlyHistory.slice(0, 9).every((v) => v === 0n)).toBe(true);
  });

  it('preserves null categoryId for the uncategorised bucket', async () => {
    const { client } = makeClient([
      {
        category_id: null,
        category_name: 'Nerazvrstano',
        category_icon: '📦',
        category_color: null,
        category_slug: '__uncategorized__',
        amount_cents: 500,
        prev_amount_cents: 0,
        monthly_history: Array.from({ length: 12 }, () => 0),
      },
    ]);
    const result = await getSpendingByCategory(client, {
      period: 'monthly',
      baseCurrency: 'BAM',
      todayDate: '2026-05-06',
    });
    expect(result[0]?.categoryId).toBeNull();
    expect(result[0]?.name).toBe('Nerazvrstano');
  });
});
