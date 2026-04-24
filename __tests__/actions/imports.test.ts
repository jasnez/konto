import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeImport,
  rejectImport,
  retryImportParse,
  togglePartialExclusion,
  updateParsedTransaction,
} from '@/lib/server/actions/imports';
import { computeDedupHash } from '@/lib/dedup';
import { convertToBase } from '@/lib/fx/convert';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/fx/convert', () => ({ convertToBase: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ─── Thenable chain builder ───────────────────────────────────────────
//
// Supabase's `PostgrestFilterBuilder` is both chainable (`.eq().in().select()`)
// and awaitable (`await supabase.from(...).update(...).eq(...)`).  The mock
// below mirrors that: each chainable method returns the same builder, and the
// builder is awaitable via `.then`, returning the configured terminal result.

interface QueryResult<T = unknown> {
  data: T;
  error: { message: string } | null;
}

function makeBuilder<T>(
  terminal: QueryResult<T>,
  overrides: Partial<Record<string, QueryResult>> = {},
): unknown {
  const withOverride = (key: string): QueryResult => overrides[key] ?? terminal;

  const builder: Record<string, unknown> = {};
  const chainable = [
    'eq',
    'neq',
    'in',
    'is',
    'not',
    'gt',
    'gte',
    'lt',
    'lte',
    'order',
    'limit',
    'range',
    'filter',
    'select',
  ] as const;
  for (const name of chainable) {
    builder[name] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(withOverride('maybeSingle'));
  builder.single = () => Promise.resolve(withOverride('single'));
  builder.then = (resolve: (value: QueryResult<T>) => unknown) =>
    Promise.resolve(terminal).then(resolve);
  return builder;
}

// ─── Table-level mock builders ────────────────────────────────────────

interface BatchRow {
  id: string;
  user_id: string;
  status: string;
  account_id: string | null;
  storage_path: string | null;
}

interface StagedRow {
  id: string;
  transaction_date: string;
  amount_minor: number;
  currency: string;
  raw_description: string;
  merchant_id: string | null;
  category_id: string | null;
}

interface ProfileRow {
  base_currency: string;
}

interface ExistingTxRow {
  dedup_hash: string | null;
  transaction_date: string;
}

interface ParsedOwnership {
  id: string;
  batch_id: string;
  user_id: string;
  status: string;
}

interface SupabaseStubOptions {
  user: { id: string } | null;
  batch?: BatchRow | null;
  staging?: StagedRow[];
  profile?: ProfileRow | null;
  existingTransactions?: ExistingTxRow[];
  rpcResult?: unknown;
  rpcError?: { message: string } | null;
  storageRemoveError?: { message: string } | null;
  parsedRow?: ParsedOwnership | null;
  togglePartialUpdated?: { id: string }[];
  categoryOwner?: { id: string } | null;
  merchantOwner?: { id: string } | null;
}

interface SupabaseStub {
  client: unknown;
  rpcSpy: ReturnType<typeof vi.fn>;
  storageRemoveSpy: ReturnType<typeof vi.fn>;
  parsedUpdatePayloads: Record<string, unknown>[];
  parsedDeleteCalls: number;
  batchUpdatePayloads: Record<string, unknown>[];
}

function buildSupabase(options: SupabaseStubOptions): SupabaseStub {
  const rpcSpy = vi.fn().mockResolvedValue({
    data: options.rpcResult ?? { imported: options.staging?.length ?? 0 },
    error: options.rpcError ?? null,
  });

  const storageRemoveSpy = vi.fn().mockResolvedValue({
    data: null,
    error: options.storageRemoveError ?? null,
  });

  const parsedUpdatePayloads: Record<string, unknown>[] = [];
  const batchUpdatePayloads: Record<string, unknown>[] = [];
  let parsedDeleteCalls = 0;

  const from = (table: string): unknown => {
    if (table === 'import_batches') {
      return {
        select: () =>
          makeBuilder({
            data: options.batch ?? null,
            error: null,
          }),
        update: (payload: Record<string, unknown>) => {
          batchUpdatePayloads.push(payload);
          return makeBuilder({ data: null, error: null });
        },
      };
    }

    if (table === 'parsed_transactions') {
      return {
        select: () =>
          makeBuilder(
            { data: options.staging ?? [], error: null },
            {
              maybeSingle: { data: options.parsedRow ?? null, error: null },
            },
          ),
        update: (payload: Record<string, unknown>) => {
          parsedUpdatePayloads.push(payload);
          return makeBuilder({
            data: options.togglePartialUpdated ?? [],
            error: null,
          });
        },
        delete: () => {
          parsedDeleteCalls += 1;
          return makeBuilder({ data: null, error: null });
        },
      };
    }

    if (table === 'profiles') {
      return {
        select: () =>
          makeBuilder({
            data: options.profile ?? null,
            error: null,
          }),
      };
    }

    if (table === 'transactions') {
      return {
        select: () =>
          makeBuilder({
            data: options.existingTransactions ?? [],
            error: null,
          }),
      };
    }

    if (table === 'categories') {
      return {
        select: () =>
          makeBuilder({
            data: options.categoryOwner ?? null,
            error: null,
          }),
      };
    }

    if (table === 'merchants') {
      return {
        select: () =>
          makeBuilder({
            data: options.merchantOwner ?? null,
            error: null,
          }),
      };
    }

    throw new Error(`Unexpected table access: ${table}`);
  };

  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: options.user } }) },
    from,
    rpc: rpcSpy,
    storage: {
      from: () => ({ remove: storageRemoveSpy }),
    },
  };

  return {
    client,
    rpcSpy,
    storageRemoveSpy,
    parsedUpdatePayloads,
    get parsedDeleteCalls() {
      return parsedDeleteCalls;
    },
    batchUpdatePayloads,
  };
}

// ─── Shared UUID fixtures ─────────────────────────────────────────────

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const BATCH_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const PARSED_ID_A = '55555555-5555-4555-8555-555555555555';
const PARSED_ID_B = '66666666-6666-4666-8666-666666666666';
const CATEGORY_ID = '77777777-7777-4777-8777-777777777777';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── finalizeImport ───────────────────────────────────────────────────

describe('finalizeImport', () => {
  it('computes FX, calls the atomic RPC, and removes the PDF from storage', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: 'user/1.pdf',
      },
      staging: [
        {
          id: PARSED_ID_A,
          transaction_date: '2026-04-10',
          amount_minor: -2500,
          currency: 'EUR',
          raw_description: 'KONZUM',
          merchant_id: null,
          category_id: CATEGORY_ID,
        },
      ],
      profile: { base_currency: 'BAM' },
      existingTransactions: [],
      rpcResult: { imported: 1 },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -4890n,
      fxRate: 1.9558,
      fxRateDate: '2026-04-10',
      fxSource: 'currency_board',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });

    expect(result).toEqual({ success: true, data: { imported: 1, skippedDuplicates: 0 } });
    expect(convertToBase).toHaveBeenCalledWith(-2500n, 'EUR', 'BAM', '2026-04-10');
    expect(stub.rpcSpy).toHaveBeenCalledWith('finalize_import_batch', {
      p_batch_id: BATCH_ID,
      p_rows: [
        expect.objectContaining({
          account_id: ACCOUNT_ID,
          original_amount_cents: -2500,
          original_currency: 'EUR',
          base_amount_cents: -4890,
          base_currency: 'BAM',
          fx_rate: 1.9558,
          fx_rate_date: '2026-04-10',
          fx_stale: false,
          transaction_date: '2026-04-10',
          merchant_raw: 'KONZUM',
          merchant_id: null,
          category_id: CATEGORY_ID,
          category_source: 'user',
        }),
      ],
    });
    expect(stub.storageRemoveSpy).toHaveBeenCalledWith(['user/1.pdf']);
  });

  it('returns ALL_DUPLICATES without calling the RPC when every staged row already exists', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: 'user/1.pdf',
      },
      staging: [
        {
          id: PARSED_ID_A,
          transaction_date: '2026-04-10',
          amount_minor: -2500,
          currency: 'BAM',
          raw_description: 'DUPE',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      existingTransactions: [
        {
          dedup_hash: computeDedupHash({
            account_id: ACCOUNT_ID,
            amount_cents: -2500n,
            date: '2026-04-10',
            merchant: 'DUPE',
          }),
          transaction_date: '2026-04-10',
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -2500n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });

    expect(result).toEqual({ success: false, error: 'ALL_DUPLICATES' });
    expect(stub.rpcSpy).not.toHaveBeenCalled();
    expect(stub.storageRemoveSpy).not.toHaveBeenCalled();
  });

  it('returns BAD_STATE when the batch is not in ready status', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'parsing',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await finalizeImport({ batchId: BATCH_ID });

    expect(result).toEqual({ success: false, error: 'BAD_STATE' });
    expect(stub.rpcSpy).not.toHaveBeenCalled();
  });

  it('correctly converts FX for a non-default currency (EUR → BAM)', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: 'user/x.pdf',
      },
      staging: [
        {
          id: PARSED_ID_A,
          transaction_date: '2026-03-15',
          amount_minor: -10_000,
          currency: 'EUR',
          raw_description: 'Amazon',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -19_558n,
      fxRate: 1.95583,
      fxRateDate: '2026-03-15',
      fxSource: 'currency_board',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result.success).toBe(true);

    expect(stub.rpcSpy).toHaveBeenCalledTimes(1);
    const args = stub.rpcSpy.mock.calls[0] as [string, { p_rows: unknown[] }];
    const row = args[1].p_rows[0] as {
      base_amount_cents: number;
      base_currency: string;
      fx_rate: number;
      fx_rate_date: string;
      fx_stale: boolean;
    };
    expect(row.base_amount_cents).toBe(-19_558);
    expect(row.base_currency).toBe('BAM');
    expect(row.fx_rate).toBe(1.95583);
    expect(row.fx_rate_date).toBe('2026-03-15');
    expect(row.fx_stale).toBe(false);
  });

  it('returns EXTERNAL_SERVICE_ERROR and skips the RPC when FX fetch fails', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
      staging: [
        {
          id: PARSED_ID_A,
          transaction_date: '2026-04-10',
          amount_minor: -2500,
          currency: 'XYZ',
          raw_description: 'unknown',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockRejectedValue(new Error('network down'));

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'EXTERNAL_SERVICE_ERROR' });
    expect(stub.rpcSpy).not.toHaveBeenCalled();
  });

  it('returns UNAUTHORIZED when there is no authenticated user', async () => {
    const stub = buildSupabase({ user: null });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'UNAUTHORIZED' });
  });

  it('is RLS-safe: returns NOT_FOUND when the batch belongs to another user', async () => {
    // In real RLS the scoped query would return `null`; we simulate that here.
    const stub = buildSupabase({
      user: { id: OTHER_USER_ID },
      batch: null,
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });
});

// ─── rejectImport ─────────────────────────────────────────────────────

describe('rejectImport', () => {
  it('deletes staging rows, removes the PDF from storage, and marks batch rejected', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: 'user/1.pdf',
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await rejectImport({ batchId: BATCH_ID });

    expect(result).toEqual({ success: true });
    expect(stub.parsedDeleteCalls).toBe(1);
    expect(stub.storageRemoveSpy).toHaveBeenCalledWith(['user/1.pdf']);
    expect(stub.batchUpdatePayloads[0]).toEqual({
      status: 'rejected',
      storage_path: null,
    });
  });

  it('skips storage removal when the batch has no stored PDF', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'failed',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await rejectImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true });
    expect(stub.storageRemoveSpy).not.toHaveBeenCalled();
    expect(stub.batchUpdatePayloads[0]).toEqual(expect.objectContaining({ status: 'rejected' }));
  });

  it('does not allow rejecting a batch that has already been imported', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'imported',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await rejectImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'BAD_STATE' });
    expect(stub.parsedDeleteCalls).toBe(0);
    expect(stub.batchUpdatePayloads).toHaveLength(0);
  });

  it('is RLS-safe: returns NOT_FOUND when batch belongs to another user', async () => {
    const stub = buildSupabase({
      user: { id: OTHER_USER_ID },
      batch: null,
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await rejectImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
    expect(stub.parsedDeleteCalls).toBe(0);
    expect(stub.storageRemoveSpy).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID batchId with VALIDATION_ERROR', async () => {
    const result = await rejectImport({ batchId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });
});

// ─── updateParsedTransaction ──────────────────────────────────────────

describe('updateParsedTransaction', () => {
  it('updates a pending_review row owned by the calling user', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      raw_description: 'Novi opis',
    });

    expect(result).toEqual({ success: true });
    expect(stub.parsedUpdatePayloads[0]).toEqual({ raw_description: 'Novi opis' });
  });

  it('is RLS-safe: refuses to update a row owned by another user', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: OTHER_USER_ID,
        status: 'pending_review',
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      selected_for_import: false,
    });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
    expect(stub.parsedUpdatePayloads).toHaveLength(0);
  });

  it('validates the date format', async () => {
    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      transaction_date: 'not-a-date',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects a category that does not belong to the user', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
      },
      categoryOwner: null,
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      category_id: CATEGORY_ID,
    });

    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
    expect(stub.parsedUpdatePayloads).toHaveLength(0);
  });
});

// ─── togglePartialExclusion ──────────────────────────────────────────

describe('togglePartialExclusion', () => {
  it('bulk-excludes rows by setting selected_for_import = false', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
      togglePartialUpdated: [{ id: PARSED_ID_A }, { id: PARSED_ID_B }],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await togglePartialExclusion({
      batchId: BATCH_ID,
      parsedIds: [PARSED_ID_A, PARSED_ID_B],
      excluded: true,
    });

    expect(result).toEqual({ success: true, updated: 2 });
    expect(stub.parsedUpdatePayloads[0]).toEqual({ selected_for_import: false });
  });

  it('bulk-includes rows by setting selected_for_import = true', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
      togglePartialUpdated: [{ id: PARSED_ID_A }],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await togglePartialExclusion({
      batchId: BATCH_ID,
      parsedIds: [PARSED_ID_A],
      excluded: false,
    });

    expect(result).toEqual({ success: true, updated: 1 });
    expect(stub.parsedUpdatePayloads[0]).toEqual({ selected_for_import: true });
  });

  it('rejects an empty id list', async () => {
    const result = await togglePartialExclusion({
      batchId: BATCH_ID,
      parsedIds: [],
      excluded: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('VALIDATION_ERROR');
    }
  });

  it('is RLS-safe: returns NOT_FOUND when the batch belongs to another user', async () => {
    const stub = buildSupabase({
      user: { id: OTHER_USER_ID },
      batch: null,
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await togglePartialExclusion({
      batchId: BATCH_ID,
      parsedIds: [PARSED_ID_A],
      excluded: true,
    });
    expect(result).toEqual({ success: false, error: 'NOT_FOUND' });
  });
});

// ─── retryImportParse ────────────────────────────────────────────────

describe('retryImportParse', () => {
  it('clears staging and resets a failed batch to uploaded', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'failed',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await retryImportParse({ batchId: BATCH_ID });

    expect(result).toEqual({ success: true });
    expect(stub.parsedDeleteCalls).toBe(1);
    expect(stub.batchUpdatePayloads[0]).toEqual({
      status: 'uploaded',
      error_message: null,
      transaction_count: null,
      parse_confidence: null,
      parse_warnings: null,
      statement_period_start: null,
      statement_period_end: null,
      imported_at: null,
    });
  });

  it('allows retry when parse succeeded with zero transactions (ready)', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'ready',
        account_id: ACCOUNT_ID,
        storage_path: 'u/f.pdf',
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await retryImportParse({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true });
    expect(stub.parsedDeleteCalls).toBe(1);
  });

  it('returns BAD_STATE while parsing is in flight', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      batch: {
        id: BATCH_ID,
        user_id: USER_ID,
        status: 'parsing',
        account_id: ACCOUNT_ID,
        storage_path: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await retryImportParse({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'BAD_STATE' });
    expect(stub.parsedDeleteCalls).toBe(0);
  });
});
