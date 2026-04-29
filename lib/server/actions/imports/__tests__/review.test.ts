import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { setTransferConversion } from '@/lib/server/actions/imports';
import { createClient } from '@/lib/supabase/server';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const PARSED_ID = '11111111-1111-4111-9111-111111111111';
const BATCH_ID = '22222222-2222-4222-9222-222222222222';
const SOURCE_ACCOUNT_ID = '33333333-3333-4333-9333-333333333333';
const CASH_ACCOUNT_ID = '44444444-4444-4444-9444-444444444444';

const getUser = vi.fn();
const from = vi.fn();

interface ParsedRow {
  id: string;
  batch_id: string;
  user_id: string;
  status: string;
  import_batches: { account_id: string } | null;
}

interface DestRow {
  id: string;
  type: string;
}

function setupClient() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser },
    from,
  } as never);
}

function mockParsedLookup(row: ParsedRow | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  };
}

function mockDestLookup(dest: DestRow | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: dest, error: null }),
          }),
        }),
      }),
    }),
  };
}

function mockUpdate(): { update: ReturnType<typeof vi.fn> } {
  // The chain is: update(...).eq('id', ...).eq('user_id', ...) → resolved.
  const eqUserId = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqId = vi.fn(() => ({ eq: eqUserId }));
  const update = vi.fn(() => ({ eq: eqId }));
  return { update };
}

describe('setTransferConversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupClient();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    from.mockReset();
  });

  it('rejects malformed input with VALIDATION_ERROR', async () => {
    const result = await setTransferConversion({
      id: 'not-a-uuid',
      batchId: BATCH_ID,
      toAccountId: CASH_ACCOUNT_ID,
    });
    expect(result).toMatchObject({ success: false, error: 'VALIDATION_ERROR' });
  });

  it('returns UNAUTHORIZED when not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: CASH_ACCOUNT_ID,
    });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('returns NOT_FOUND when the parsed row is missing or owned by another user', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') return mockParsedLookup(null);
      throw new Error(`unexpected from(${table})`);
    });

    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: CASH_ACCOUNT_ID,
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it('refuses SAME_ACCOUNT when conversion target equals the source account', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') {
        return mockParsedLookup({
          id: PARSED_ID,
          batch_id: BATCH_ID,
          user_id: 'user-1',
          status: 'pending_review',
          import_batches: { account_id: SOURCE_ACCOUNT_ID },
        });
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: SOURCE_ACCOUNT_ID,
    });
    expect(result).toEqual({ success: false, error: 'SAME_ACCOUNT' });
  });

  it('refuses NOT_CASH_ACCOUNT when destination is not type=cash', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') {
        return mockParsedLookup({
          id: PARSED_ID,
          batch_id: BATCH_ID,
          user_id: 'user-1',
          status: 'pending_review',
          import_batches: { account_id: SOURCE_ACCOUNT_ID },
        });
      }
      if (table === 'accounts') {
        return mockDestLookup({ id: CASH_ACCOUNT_ID, type: 'savings' });
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: CASH_ACCOUNT_ID,
    });
    expect(result).toEqual({ success: false, error: 'NOT_CASH_ACCOUNT' });
  });

  it('persists the conversion target and revalidates the review path', async () => {
    const updateImpl = mockUpdate();
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') {
        // First call: lookup. Second call: update.
        if (updateImpl.update.mock.calls.length === 0) {
          return mockParsedLookup({
            id: PARSED_ID,
            batch_id: BATCH_ID,
            user_id: 'user-1',
            status: 'pending_review',
            import_batches: { account_id: SOURCE_ACCOUNT_ID },
          });
        }
        return updateImpl;
      }
      if (table === 'accounts') {
        return mockDestLookup({ id: CASH_ACCOUNT_ID, type: 'cash' });
      }
      throw new Error(`unexpected from(${table})`);
    });

    // Make from() return updateImpl on the second parsed_transactions call.
    let parsedCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') {
        parsedCalls += 1;
        if (parsedCalls === 1) {
          return mockParsedLookup({
            id: PARSED_ID,
            batch_id: BATCH_ID,
            user_id: 'user-1',
            status: 'pending_review',
            import_batches: { account_id: SOURCE_ACCOUNT_ID },
          });
        }
        return updateImpl;
      }
      if (table === 'accounts') {
        return mockDestLookup({ id: CASH_ACCOUNT_ID, type: 'cash' });
      }
      throw new Error(`unexpected from(${table})`);
    });

    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: CASH_ACCOUNT_ID,
    });

    expect(result).toEqual({ success: true });
    expect(updateImpl.update).toHaveBeenCalledWith({
      convert_to_transfer_to_account_id: CASH_ACCOUNT_ID,
    });
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/import/${BATCH_ID}`);
  });

  it('clears the flag when toAccountId is null without checking dest account', async () => {
    const updateImpl = mockUpdate();
    let parsedCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'parsed_transactions') {
        parsedCalls += 1;
        if (parsedCalls === 1) {
          return mockParsedLookup({
            id: PARSED_ID,
            batch_id: BATCH_ID,
            user_id: 'user-1',
            status: 'pending_review',
            import_batches: { account_id: SOURCE_ACCOUNT_ID },
          });
        }
        return updateImpl;
      }
      throw new Error(`unexpected from(${table}) (parsedCalls=${String(parsedCalls)})`);
    });

    const result = await setTransferConversion({
      id: PARSED_ID,
      batchId: BATCH_ID,
      toAccountId: null,
    });

    expect(result).toEqual({ success: true });
    expect(updateImpl.update).toHaveBeenCalledWith({
      convert_to_transfer_to_account_id: null,
    });
  });
});
