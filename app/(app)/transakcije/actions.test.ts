import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bulkDeleteTransactions,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from './actions';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const getUser = vi.fn();
const from = vi.fn();

interface ChainTerminal {
  data: unknown;
  error: unknown;
}

function fluent(terminal: ChainTerminal) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    update: () => chain,
    insert: () => chain,
  };
  return chain;
}

function makeUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('transaction actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockReset();
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser }, from } as never);
  });

  it('create success', async () => {
    let txFromCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts')
        return fluent({ data: { id: 'acc1', currency: 'BAM' }, error: null });
      if (table === 'profiles') return fluent({ data: { base_currency: 'BAM' }, error: null });
      if (table === 'transactions') {
        txFromCalls += 1;
        if (txFromCalls === 1) return fluent({ data: null, error: null });
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'tx-1' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 2500n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
      merchant_raw: 'Konzum',
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: true, data: { id: 'tx-1' } });
  });

  it('create with validation error', async () => {
    const result = await createTransaction({
      account_id: 'not-a-uuid',
      amount_cents: 0n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });

  it('MT-4/invalid-input: zero amount rejected pre-DB (createClient never called)', async () => {
    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 0n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it('MT-4/invalid-input: non-ISO date rejected pre-DB (createClient never called)', async () => {
    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 1000n,
      currency: 'BAM',
      transaction_date: 'not-a-date',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it('create unauthorized', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 1000n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
      merchant_raw: null,
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('create with duplicate returns DUPLICATE code', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'accounts')
        return fluent({ data: { id: 'acc1', currency: 'BAM' }, error: null });
      if (table === 'profiles') return fluent({ data: { base_currency: 'BAM' }, error: null });
      if (table === 'transactions') return fluent({ data: { id: 'tx-existing' }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 1000n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
      merchant_raw: 'Konzum',
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: false, error: 'DUPLICATE', duplicateId: 'tx-existing' });
  });

  it('create cross-user account returns FORBIDDEN', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'accounts') return fluent({ data: null, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 1000n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
      merchant_raw: null,
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: false, error: 'FORBIDDEN' });
  });

  it('FX conversion BAM->BAM keeps base equal original', async () => {
    let insertedPayload: Record<string, unknown> | undefined;
    let txFromCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts')
        return fluent({ data: { id: 'acc1', currency: 'BAM' }, error: null });
      if (table === 'profiles') return fluent({ data: { base_currency: 'BAM' }, error: null });
      if (table === 'transactions') {
        txFromCalls += 1;
        if (txFromCalls === 1) return fluent({ data: null, error: null });
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'tx-fx-bam' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 10000n,
      currency: 'BAM',
      transaction_date: '2026-04-23',
      merchant_raw: null,
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: true, data: { id: 'tx-fx-bam' } });
    expect(insertedPayload?.original_amount_cents).toBe(10000);
    expect(insertedPayload?.base_amount_cents).toBe(10000);
    expect(insertedPayload?.account_ledger_cents).toBe(10000);
  });

  it('FX conversion EUR->BAM applies currency board rate', async () => {
    let insertedPayload: Record<string, unknown> | undefined;
    let txFromCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'accounts')
        return fluent({ data: { id: 'acc1', currency: 'EUR' }, error: null });
      if (table === 'profiles') return fluent({ data: { base_currency: 'BAM' }, error: null });
      if (table === 'transactions') {
        txFromCalls += 1;
        if (txFromCalls === 1) return fluent({ data: null, error: null });
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'tx-fx-eur' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await createTransaction({
      account_id: '123e4567-e89b-12d3-a456-426614174000',
      amount_cents: 10000n,
      currency: 'EUR',
      transaction_date: '2026-04-23',
      merchant_raw: null,
      category_id: null,
      notes: null,
    });

    expect(result).toEqual({ success: true, data: { id: 'tx-fx-eur' } });
    expect(insertedPayload?.base_amount_cents).toBe(19558);
    expect(insertedPayload?.account_ledger_cents).toBe(10000);
  });

  it('delete sets deleted_at', async () => {
    let updatePayload: Record<string, unknown> | undefined;
    from.mockImplementation((table: string) => {
      if (table !== 'transactions') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'tx1', account_id: 'acc1', transfer_pair_id: null, deleted_at: null },
                  error: null,
                }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: () => ({
              in: () => ({
                is: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        },
      };
    });

    const result = await deleteTransaction('123e4567-e89b-12d3-a456-426614174000');
    expect(result).toEqual({ success: true });
    expect(typeof updatePayload?.deleted_at).toBe('string');
  });

  it('UX-3: updateTransaction with zero amount returns field-level error on amount_cents', async () => {
    const result = await updateTransaction('123e4567-e89b-12d3-a456-426614174000', {
      amount_cents: 0n,
    });

    expect(result.success).toBe(false);
    if (!result.success && result.error === 'VALIDATION_ERROR') {
      expect(result.details.amount_cents?.[0]).toBeTruthy();
      expect(result.details._root).toBeUndefined();
    }
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it('bulk delete handles 50+ ids in one update call', async () => {
    const ids = Array.from({ length: 55 }, (_, i) => makeUuid(i + 1));
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({
        in: () => ({
          is: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });

    from.mockImplementation((table: string) => {
      if (table !== 'transactions') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              is: () =>
                Promise.resolve({
                  data: ids.map((id) => ({ id, account_id: 'acc-bulk' })),
                  error: null,
                }),
            }),
          }),
        }),
        update: updateSpy,
      };
    });

    const result = await bulkDeleteTransactions(ids);

    expect(result).toEqual({ success: true, data: { count: 55 } });
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
