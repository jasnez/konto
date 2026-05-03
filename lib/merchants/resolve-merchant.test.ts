import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as merchantsDb from '@/lib/db/merchants';
import type { DbClient } from '@/lib/db/types';
import { resolveMerchantForReceipt } from './resolve-merchant';

vi.mock('@/lib/db/merchants', () => ({
  findMerchantByCanonical: vi.fn(),
  insertMerchant: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logSafe: vi.fn(),
  logWarn: vi.fn(),
}));

const findMerchantByCanonical = vi.mocked(merchantsDb.findMerchantByCanonical);
const insertMerchant = vi.mocked(merchantsDb.insertMerchant);

const USER_ID = 'u1';

function makeSupabase(
  rpcImpl: (name: string, args: unknown) => unknown = () => ({ data: [], error: null }),
) {
  const rpc = vi.fn(rpcImpl);
  return { rpc } as unknown as DbClient & { rpc: ReturnType<typeof vi.fn> };
}

describe('resolveMerchantForReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for null input without touching db', async () => {
    const supabase = makeSupabase();
    const result = await resolveMerchantForReceipt(supabase, USER_ID, null);
    expect(result).toEqual({ merchantId: null, created: false });
    expect(findMerchantByCanonical).not.toHaveBeenCalled();
    expect(insertMerchant).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns null for empty string input', async () => {
    const supabase = makeSupabase();
    const result = await resolveMerchantForReceipt(supabase, USER_ID, '   ');
    expect(result).toEqual({ merchantId: null, created: false });
    expect(findMerchantByCanonical).not.toHaveBeenCalled();
  });

  it('returns null when normalization yields empty (suffix-only input)', async () => {
    const supabase = makeSupabase();
    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'd.o.o.');
    expect(result).toEqual({ merchantId: null, created: false });
    expect(findMerchantByCanonical).not.toHaveBeenCalled();
  });

  it('returns existing merchant id on exact canonical match', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({
      data: { id: 'm-existing' },
      error: null,
    } as never);

    const supabase = makeSupabase();
    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum d.o.o.');

    expect(result).toEqual({ merchantId: 'm-existing', created: false });
    expect(findMerchantByCanonical).toHaveBeenCalledWith(supabase, USER_ID, 'konzum');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(insertMerchant).not.toHaveBeenCalled();
  });

  it('uses fuzzy match when exact misses and similarity >= 0.55', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({
      data: [{ id: 'm-fuzzy', similarity_score: 0.7 }],
      error: null,
    }));

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');

    expect(result).toEqual({ merchantId: 'm-fuzzy', created: false });
    expect(supabase.rpc).toHaveBeenCalledWith('search_merchants', {
      p_query: 'konzum',
      p_limit: 1,
    });
    expect(insertMerchant).not.toHaveBeenCalled();
  });

  it('rejects fuzzy match below threshold and creates new merchant instead', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({
      data: [{ id: 'm-too-different', similarity_score: 0.4 }],
      error: null,
    }));
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum Split');

    expect(result).toEqual({ merchantId: 'm-new', created: true });
    expect(insertMerchant).toHaveBeenCalledWith(supabase, {
      user_id: USER_ID,
      canonical_name: 'konzum split',
      display_name: 'Konzum Split',
    });
  });

  it('rejects substring-only match (similarity 0) and creates new', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({
      data: [{ id: 'm-substring', similarity_score: 0 }],
      error: null,
    }));
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'AC Petrol');
    expect(result).toEqual({ merchantId: 'm-new', created: true });
  });

  it('creates a new merchant when no match found', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Lidl');

    expect(result).toEqual({ merchantId: 'm-new', created: true });
    expect(insertMerchant).toHaveBeenCalledWith(supabase, {
      user_id: USER_ID,
      canonical_name: 'lidl',
      display_name: 'Lidl',
    });
  });

  it('handles 23505 race by refetching the existing merchant', async () => {
    findMerchantByCanonical
      .mockResolvedValueOnce({ data: null, error: null } as never)
      .mockResolvedValueOnce({ data: { id: 'm-raced' }, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');

    expect(result).toEqual({ merchantId: 'm-raced', created: false });
    expect(findMerchantByCanonical).toHaveBeenCalledTimes(2);
  });

  it('returns null when 23505 + refetch miss (soft-deleted blocker)', async () => {
    findMerchantByCanonical
      .mockResolvedValueOnce({ data: null, error: null } as never)
      .mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');

    expect(result).toEqual({ merchantId: null, created: false });
  });

  it('returns null on insert error other than 23505', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');

    expect(result).toEqual({ merchantId: null, created: false });
  });

  it('does not throw if findMerchantByCanonical throws — falls through to fuzzy', async () => {
    findMerchantByCanonical.mockRejectedValueOnce(new Error('network'));
    const supabase = makeSupabase(() => ({
      data: [{ id: 'm-fuzzy', similarity_score: 0.9 }],
      error: null,
    }));

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');
    expect(result).toEqual({ merchantId: 'm-fuzzy', created: false });
  });

  it('does not throw if rpc throws — falls through to insert', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => {
      throw new Error('rpc boom');
    });
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    const result = await resolveMerchantForReceipt(supabase, USER_ID, 'Konzum');
    expect(result).toEqual({ merchantId: 'm-new', created: true });
  });

  it('uses trimmed (not normalized) value as display_name, capped at 120 chars', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    const longName = 'A'.repeat(150);
    await resolveMerchantForReceipt(supabase, USER_ID, `   ${longName}   `);

    expect(insertMerchant).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        display_name: 'A'.repeat(120),
      }),
    );
  });

  it('preserves diacritics and original case in display_name', async () => {
    findMerchantByCanonical.mockResolvedValueOnce({ data: null, error: null } as never);
    const supabase = makeSupabase(() => ({ data: [], error: null }));
    insertMerchant.mockResolvedValueOnce({ data: { id: 'm-new' }, error: null } as never);

    await resolveMerchantForReceipt(supabase, USER_ID, 'Pekara Šećer d.o.o.');

    expect(insertMerchant).toHaveBeenCalledWith(supabase, {
      user_id: USER_ID,
      canonical_name: 'pekara secer',
      display_name: 'Pekara Šećer d.o.o.',
    });
  });
});
