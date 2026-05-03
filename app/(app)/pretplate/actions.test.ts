import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindTransactionToRecurring,
  cancelRecurring,
  confirmRecurring,
  editRecurring,
  pauseRecurring,
} from './actions';
import { revalidatePath } from 'next/cache';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));

interface ChainTerminal {
  data: unknown;
  error: { code?: string; message: string } | null;
}

function fluent(terminal: ChainTerminal) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainTerminal) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

const REC_ID = 'b1f9c7e4-3f1a-4d92-9c2e-aabbccddeeff';
const TX_ID = 'c2a8d5b6-4f2b-4e83-8d3c-aabbccddeeff';
const CAT_ID = 'd3a8f5e7-4b2c-4d83-9e3c-aabbccddeeff';

const VALID_CONFIRM = {
  merchantId: null,
  categoryId: CAT_ID,
  accountId: null,
  description: 'Netflix',
  period: 'monthly' as const,
  averageAmountCents: '-1500',
  currency: 'BAM',
  lastSeen: '2026-04-01',
  nextExpected: '2026-05-01',
  confidence: 0.95,
  occurrences: 6,
  transactionIds: [TX_ID],
};

// ─── confirmRecurring ───────────────────────────────────────────────────────

describe('confirmRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
    rpc.mockReset();
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await confirmRecurring(VALID_CONFIRM);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns VALIDATION_ERROR for missing required fields', async () => {
    const result = await confirmRecurring({ description: 'X' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects averageAmountCents = 0 (zod refine)', async () => {
    const result = await confirmRecurring({ ...VALID_CONFIRM, averageAmountCents: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid transactionIds', async () => {
    const result = await confirmRecurring({ ...VALID_CONFIRM, transactionIds: ['not-uuid'] });
    expect(result.success).toBe(false);
  });

  it('happy path: passes payload to RPC and returns id', async () => {
    rpc.mockResolvedValue({ data: { id: REC_ID }, error: null });
    const result = await confirmRecurring(VALID_CONFIRM);
    expect(result).toEqual({ success: true, data: { id: REC_ID } });
    expect(rpc).toHaveBeenCalledWith(
      'confirm_recurring',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          description: 'Netflix',
          averageAmountCents: '-1500',
          transactionIds: [TX_ID],
        }) as object,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/pretplate');
    expect(revalidatePath).toHaveBeenCalledWith('/pocetna');
  });

  it('maps RLS WITH CHECK violation (42501) → REFERENCED_NOT_OWNED', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });
    const result = await confirmRecurring(VALID_CONFIRM);
    expect(result).toEqual({ success: false, error: 'REFERENCED_NOT_OWNED' });
  });

  it('falls back to DATABASE_ERROR for unknown PG codes', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '08006', message: 'connection failure' },
    });
    const result = await confirmRecurring(VALID_CONFIRM);
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });

  it('returns DATABASE_ERROR when RPC succeeds but payload has no id', async () => {
    rpc.mockResolvedValue({ data: { something: 'else' }, error: null });
    const result = await confirmRecurring(VALID_CONFIRM);
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
  });

  it('coerces null/empty optional uuids to null in payload', async () => {
    rpc.mockResolvedValue({ data: { id: REC_ID }, error: null });
    await confirmRecurring({ ...VALID_CONFIRM, merchantId: '', accountId: null });
    expect(rpc).toHaveBeenCalledWith(
      'confirm_recurring',
      expect.objectContaining({
        p_payload: expect.objectContaining({
          merchantId: null,
          accountId: null,
        }) as object,
      }),
    );
  });
});

// ─── editRecurring ──────────────────────────────────────────────────────────

describe('editRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('returns NOT_FOUND for cross-user id (ownership pre-check)', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await editRecurring(REC_ID, { description: 'New' });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('returns VALIDATION_ERROR for malformed id', async () => {
    const result = await editRecurring('not-uuid', { description: 'X' });
    expect(result.success).toBe(false);
  });

  it('returns UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await editRecurring(REC_ID, { description: 'X' });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('happy path: applies patch and revalidates', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await editRecurring(REC_ID, { description: 'Spotify Family' });
    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith('/pretplate');
  });

  it('no-op patch (empty input) still succeeds', async () => {
    from.mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }));
    const result = await editRecurring(REC_ID, {});
    expect(result).toEqual({ success: true });
  });

  it('maps RLS check failure on category change → REFERENCED_NOT_OWNED', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }))
      .mockImplementationOnce(() =>
        fluent({
          data: null,
          error: { code: '42501', message: 'new row violates row-level security policy' },
        }),
      );
    const result = await editRecurring(REC_ID, { categoryId: CAT_ID });
    expect(result).toEqual({ success: false, error: 'REFERENCED_NOT_OWNED' });
  });

  it('rejects strict-mode unknown fields (Zod .strict())', async () => {
    const result = await editRecurring(REC_ID, { unknownField: 'x' });
    expect(result.success).toBe(false);
  });
});

// ─── pauseRecurring ─────────────────────────────────────────────────────────

describe('pauseRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: writes paused_until and active=true', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await pauseRecurring(REC_ID, { until: '2027-01-01' });
    expect(result).toEqual({ success: true });
  });

  it('NOT_FOUND for cross-user id', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await pauseRecurring(REC_ID, { until: '2027-01-01' });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('rejects malformed until date', async () => {
    const result = await pauseRecurring(REC_ID, { until: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('requires until field (not optional)', async () => {
    const result = await pauseRecurring(REC_ID, {});
    expect(result.success).toBe(false);
  });
});

// ─── cancelRecurring ────────────────────────────────────────────────────────

describe('cancelRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: writes active=false', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await cancelRecurring(REC_ID);
    expect(result).toEqual({ success: true });
  });

  it('NOT_FOUND for cross-user id', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await cancelRecurring(REC_ID);
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('VALIDATION_ERROR for malformed id', async () => {
    const result = await cancelRecurring('not-uuid');
    expect(result.success).toBe(false);
  });

  it('UNAUTHORIZED when not logged in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await cancelRecurring(REC_ID);
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });
});

// ─── bindTransactionToRecurring ─────────────────────────────────────────────

describe('bindTransactionToRecurring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    from.mockReset();
  });

  it('happy path: both pre-checks pass + UPDATE succeeds', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null })) // recurring lookup
      .mockImplementationOnce(() => fluent({ data: { id: TX_ID }, error: null })) // tx lookup
      .mockImplementationOnce(() => fluent({ data: null, error: null })); // update
    const result = await bindTransactionToRecurring(REC_ID, { transactionId: TX_ID });
    expect(result).toEqual({ success: true });
  });

  it('NOT_FOUND when recurring is foreign', async () => {
    from.mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await bindTransactionToRecurring(REC_ID, { transactionId: TX_ID });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('NOT_FOUND when transaction is foreign', async () => {
    from
      .mockImplementationOnce(() => fluent({ data: { id: REC_ID }, error: null }))
      .mockImplementationOnce(() => fluent({ data: null, error: null }));
    const result = await bindTransactionToRecurring(REC_ID, { transactionId: TX_ID });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('VALIDATION_ERROR for malformed transactionId', async () => {
    const result = await bindTransactionToRecurring(REC_ID, { transactionId: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});
