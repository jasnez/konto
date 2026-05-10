/**
 * TR-1 / TR-2: Unit tests for convertTransactionToTransfer error mapping.
 *
 * These tests cover the *action surface* — verifying that the new
 * errcode-based mapping (KX001-KX007 → typed result codes) collapses
 * each Postgres error correctly. Migration 00073's `for update` lock
 * (TR-2 defense-in-depth) is verified at the DB integration level by
 * the existing RLS test suite running against a live Supabase instance.
 *
 * What these tests DON'T cover:
 *   - Full happy-path INSERT chain (DB-level — covered by integration).
 *   - Concurrent-call serialisation (requires a real Postgres lock —
 *     covered by integration with parallel client connections).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertTransactionToTransfer } from '../actions';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/server/revalidate-views', () => ({
  revalidateAfterTransactionWrite: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logSafe: vi.fn(),
}));

const getUser = vi.fn();
const rpc = vi.fn();

const VALID_INPUT = {
  transaction_id: '00000000-0000-4000-8000-000000000001',
  counterparty_account_id: '00000000-0000-4000-8000-000000000002',
};

function setupClient() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser },
    rpc,
    from: vi.fn(),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  setupClient();
});

describe('convertTransactionToTransfer — errcode mapping (TR-1)', () => {
  it('happy path returns success with from/to ids', async () => {
    rpc.mockResolvedValue({
      data: { from_id: 'from-1', to_id: 'to-1', deleted_id: VALID_INPUT.transaction_id },
      error: null,
    });

    const result = await convertTransactionToTransfer(VALID_INPUT);

    expect(result).toEqual({ success: true, data: { fromId: 'from-1', toId: 'to-1' } });
  });

  it('VALIDATION_ERROR for non-uuid input', async () => {
    const result = await convertTransactionToTransfer({
      transaction_id: 'not-a-uuid',
      counterparty_account_id: 'also-not',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });

  it('UNAUTHORIZED when no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('KX001 → UNAUTHORIZED', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX001', message: 'UNAUTHORIZED' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('KX002 → NOT_FOUND', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX002', message: 'NOT_FOUND' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('KX003 → ALREADY_TRANSFER', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX003', message: 'ALREADY_TRANSFER' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'ALREADY_TRANSFER' });
  });

  it('KX004 (ZERO_AMOUNT) → DATABASE_ERROR (internal guard, no UI surface)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX004', message: 'ZERO_AMOUNT' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    // KX004 is an internal invariant guard — UI shouldn't ever trigger it
    // (zero-amount transactions are blocked at the form layer). If it
    // happens, surface as generic DATABASE_ERROR so the user sees a
    // consistent fallback rather than confusing UI copy.
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });

  it('KX005 → SAME_ACCOUNT', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX005', message: 'SAME_ACCOUNT' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'SAME_ACCOUNT' });
  });

  it('KX006 (COUNTERPARTY_NOT_FOUND) → NOT_FOUND (SE-14 collapse)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX006', message: 'COUNTERPARTY_NOT_FOUND' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    // SE-14: "counterparty not yours" must NOT leak as a distinct error
    // — collapse with KX002's NOT_FOUND so foreign-counterparty probing
    // is indistinguishable from "doesn't exist".
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('KX007 → CROSS_CURRENCY_NOT_SUPPORTED', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'KX007', message: 'CROSS_CURRENCY_NOT_SUPPORTED' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'CROSS_CURRENCY_NOT_SUPPORTED' });
  });

  it('unknown errcode falls through to DATABASE_ERROR', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'unique_violation' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });

  it('error with no code falls through to DATABASE_ERROR', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'something went wrong' },
    });
    const result = await convertTransactionToTransfer(VALID_INPUT);
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });
});
