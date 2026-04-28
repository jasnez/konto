import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeImport,
  rejectImport,
  retryImportParse,
  togglePartialExclusion,
  updateParsedTransaction,
} from '@/lib/server/actions/imports';
import { convertToBase } from '@/lib/fx/convert';
import { createClient } from '@/lib/supabase/server';
import { resolveFxRatesForBatch } from '@/lib/fx/batch-resolver';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/fx/convert', () => ({
  convertToBase: vi.fn(),
  resolveFxRate: vi.fn(async (from: string, to: string, date: string) => {
    if (from === to) {
      return { fxRate: 1, fxRateDate: date, fxSource: 'identity', fxStale: false };
    }
    if (from === 'EUR' && to === 'BAM') {
      return { fxRate: 1.9558, fxRateDate: date, fxSource: 'currency_board', fxStale: false };
    }
    if (from === 'BAM' && to === 'EUR') {
      return { fxRate: 0.5112, fxRateDate: date, fxSource: 'currency_board', fxStale: false };
    }
    return { fxRate: 1.5, fxRateDate: date, fxSource: 'ecb', fxStale: false };
  }),
  toCents: (amount: bigint, rate: number) => BigInt(Math.round(Number(amount) * rate)),
}));
vi.mock('@/lib/fx/batch-resolver', async () => {
  const convert = await vi.importActual<typeof import('@/lib/fx/convert')>('@/lib/fx/convert');
  return {
    resolveFxRatesForBatch: vi.fn(async (rows: Array<{ currency: string; transaction_date: string }>, baseCurrency: string, accountCurrency: string) => {
      const resolveFxRateMocked = vi.mocked(convert.resolveFxRate);
      const map = new Map();
      const keysToResolve = new Set<string>();

      for (const row of rows) {
        const from = row.currency.trim().toUpperCase();
        const base = baseCurrency.trim().toUpperCase();
        const acct = accountCurrency.trim().toUpperCase();
        keysToResolve.add(`${from}|${base}|${row.transaction_date}`);
        if (from !== acct && base !== acct) {
          keysToResolve.add(`${from}|${acct}|${row.transaction_date}`);
        }
      }

      for (const key of keysToResolve) {
        const [from, to, date] = key.split('|');
        const rate = await resolveFxRateMocked(from, to, date);
        map.set(key, rate);
      }
      return map;
    }),
  };
});
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
    'ilike',
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

interface ParsedOwnership {
  id: string;
  batch_id: string;
  user_id: string;
  status: string;
  raw_description?: string;
  category_id?: string | null;
  categorization_source?: string | null;
  categorization_confidence?: number | null;
}

interface SupabaseStubOptions {
  user: { id: string } | null;
  batch?: BatchRow | null;
  staging?: StagedRow[];
  profile?: ProfileRow | null;
  /** Indices (0-based) to skip from `import_dedup_filter` RPC. */
  dedupSkipIndices?: number[];
  importDedupError?: { message: string } | null;
  rpcResult?: unknown;
  rpcError?: { message: string } | null;
  storageRemoveError?: { message: string } | null;
  parsedRow?: ParsedOwnership | null;
  togglePartialUpdated?: { id: string }[];
  /** Import target account: used for `account_ledger_cents` (defaults to BAM). */
  account?: { currency: string };
  categoryOwner?: { id: string } | null;
  merchantOwner?: { id: string } | null;
  /** Rows returned by the `user_corrections` SELECT in `maybeCreateAlias`. */
  correctionRows?: { new_value: string | null }[];
  /** Rows returned by the `merchant_aliases` SELECT (existing alias check). */
  aliasRows?: { id: string; merchant_id: string; pattern: string }[];
  /** Rows returned by the `merchants` SELECT (existing-merchant lookup). */
  existingMerchants?: { id: string; default_category_id: string | null }[];
  /** Row returned by the `merchants` insert .single(). */
  insertedMerchant?: { id: string };
  /** Row returned by the `merchant_aliases` insert .single(). */
  insertedAlias?: { id: string };
}

interface SupabaseStub {
  client: unknown;
  rpcSpy: ReturnType<typeof vi.fn>;
  storageRemoveSpy: ReturnType<typeof vi.fn>;
  parsedUpdatePayloads: Record<string, unknown>[];
  parsedDeleteCalls: number;
  batchUpdatePayloads: Record<string, unknown>[];
  correctionInserts: Record<string, unknown>[];
  merchantInserts: Record<string, unknown>[];
  aliasInserts: Record<string, unknown>[];
}

function buildSupabase(options: SupabaseStubOptions): SupabaseStub {
  const rpcSpy = vi
    .fn()
    .mockImplementation((name: string, args: Record<string, unknown> | undefined) => {
      if (name === 'import_dedup_filter') {
        if (options.importDedupError) {
          return Promise.resolve({ data: null, error: options.importDedupError });
        }
        return Promise.resolve({
          data: options.dedupSkipIndices ?? [],
          error: null,
        });
      }
      if (name === 'finalize_import_batch') {
        const pRows = args?.p_rows;
        const n = Array.isArray(pRows) ? pRows.length : 0;
        return Promise.resolve({
          data: options.rpcResult ?? { imported: n },
          error: options.rpcError ?? null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${name}` } });
    });

  const storageRemoveSpy = vi.fn().mockResolvedValue({
    data: null,
    error: options.storageRemoveError ?? null,
  });

  const parsedUpdatePayloads: Record<string, unknown>[] = [];
  const batchUpdatePayloads: Record<string, unknown>[] = [];
  const correctionInserts: Record<string, unknown>[] = [];
  const merchantInserts: Record<string, unknown>[] = [];
  const aliasInserts: Record<string, unknown>[] = [];
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

    if (table === 'accounts') {
      const accRow = { currency: options.account?.currency ?? 'BAM' };
      return {
        select: () =>
          makeBuilder(
            { data: accRow, error: null },
            { maybeSingle: { data: accRow, error: null } },
          ),
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
            data: [],
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
      // The action uses .maybeSingle() for the ownership check; the
      // learning loop uses an awaitable .limit(1) for the canonical-name
      // lookup, and .insert(...).select().single() for fresh creates.
      return {
        select: () =>
          makeBuilder(
            { data: options.existingMerchants ?? [], error: null },
            {
              maybeSingle: { data: options.merchantOwner ?? null, error: null },
            },
          ),
        insert: (payload: Record<string, unknown>) => {
          merchantInserts.push(payload);
          return makeBuilder(
            { data: null, error: null },
            {
              single: {
                data: options.insertedMerchant ?? { id: 'merchant-new' },
                error: null,
              },
            },
          );
        },
        update: () => makeBuilder({ data: null, error: null }),
      };
    }

    if (table === 'merchant_aliases') {
      return {
        select: () =>
          makeBuilder({
            data: options.aliasRows ?? [],
            error: null,
          }),
        insert: (payload: Record<string, unknown>) => {
          aliasInserts.push(payload);
          return makeBuilder(
            { data: null, error: null },
            {
              single: {
                data: options.insertedAlias ?? { id: 'alias-new' },
                error: null,
              },
            },
          );
        },
      };
    }

    if (table === 'user_corrections') {
      return {
        select: () =>
          makeBuilder({
            data: options.correctionRows ?? [],
            error: null,
          }),
        insert: (payload: Record<string, unknown>) => {
          correctionInserts.push(payload);
          return makeBuilder({ data: null, error: null });
        },
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
    correctionInserts,
    merchantInserts,
    aliasInserts,
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
    expect(stub.rpcSpy).toHaveBeenCalledWith('import_dedup_filter', {
      p_account_id: ACCOUNT_ID,
      p_rows: [
        {
          transaction_date: '2026-04-10',
          original_amount_cents: -2500,
          merchant_raw: 'KONZUM',
        },
      ],
    });
    expect(stub.rpcSpy).toHaveBeenCalledWith('finalize_import_batch', {
      p_batch_id: BATCH_ID,
      p_dedup_skipped: 0,
      p_rows: [
        expect.objectContaining({
          account_id: ACCOUNT_ID,
          original_amount_cents: -2500,
          original_currency: 'EUR',
          base_amount_cents: -4890,
          base_currency: 'BAM',
          account_ledger_cents: -4890,
          fx_rate: 1.9558,
          fx_rate_date: '2026-04-10',
          fx_stale: false,
          transaction_date: '2026-04-10',
          merchant_raw: 'KONZUM',
          merchant_id: null,
          category_id: CATEGORY_ID,
          category_source: 'user',
          category_confidence: 1,
        }),
      ],
    });
    expect(stub.storageRemoveSpy).toHaveBeenCalledWith(['user/1.pdf']);
  });

  it('returns ALL_DUPLICATES without calling finalize_import_batch when the dedup pass skips every row', async () => {
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
      dedupSkipIndices: [0],
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
    expect(stub.rpcSpy).toHaveBeenCalledWith('import_dedup_filter', expect.any(Object));
    expect(stub.rpcSpy.mock.calls.some((c) => c[0] === 'finalize_import_batch')).toBe(false);
    expect(stub.storageRemoveSpy).not.toHaveBeenCalled();
  });

  it('skips the second row when it is a duplicate of the first (in-batch dedup)', async () => {
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
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'KONZUM',
          merchant_id: null,
          category_id: null,
        },
        {
          id: PARSED_ID_B,
          transaction_date: '2026-04-10',
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'KONZUM',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      dedupSkipIndices: [1],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -100n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true, data: { imported: 1, skippedDuplicates: 1 } });
    expect(stub.rpcSpy).toHaveBeenCalledWith(
      'finalize_import_batch',
      expect.objectContaining({
        p_batch_id: BATCH_ID,
        p_dedup_skipped: 1,
      }),
    );
    const fin = stub.rpcSpy.mock.calls.find((c) => c[0] === 'finalize_import_batch')?.[1] as {
      p_rows: unknown[];
    };
    expect(fin.p_rows).toHaveLength(1);
  });

  it('returns DATABASE_ERROR when import_dedup_filter fails', async () => {
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
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'X',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      importDedupError: { message: 'rpc failed' },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -100n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: false, error: 'DATABASE_ERROR' });
    expect(stub.rpcSpy.mock.calls.some((c) => c[0] === 'finalize_import_batch')).toBe(false);
  });

  it('does not treat different dates as duplicates (orchestration: no skip from RPC)', async () => {
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
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'SHOP',
          merchant_id: null,
          category_id: null,
        },
        {
          id: PARSED_ID_B,
          transaction_date: '2026-04-12',
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'SHOP',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      dedupSkipIndices: [],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -100n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true, data: { imported: 2, skippedDuplicates: 0 } });
    const fin = stub.rpcSpy.mock.calls.find((c) => c[0] === 'finalize_import_batch')?.[1] as {
      p_rows: unknown[];
    };
    expect(fin.p_rows).toHaveLength(2);
  });

  it('does not treat different amounts as duplicates (orchestration)', async () => {
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
          amount_minor: -100,
          currency: 'BAM',
          raw_description: 'SHOP',
          merchant_id: null,
          category_id: null,
        },
        {
          id: PARSED_ID_B,
          transaction_date: '2026-04-10',
          amount_minor: -200,
          currency: 'BAM',
          raw_description: 'SHOP',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      dedupSkipIndices: [],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -100n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true, data: { imported: 2, skippedDuplicates: 0 } });
  });

  it('allows "BINGO" vs "BINGO MARKET" when the RPC does not mark them as duplicates (trigram lives in SQL)', async () => {
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
          amount_minor: -500,
          currency: 'BAM',
          raw_description: 'BINGO',
          merchant_id: null,
          category_id: null,
        },
        {
          id: PARSED_ID_B,
          transaction_date: '2026-04-10',
          amount_minor: -500,
          currency: 'BAM',
          raw_description: 'BINGO MARKET',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
      /** Simulates similarity ≤ 0.8 between normalised strings in Postgres. */
      dedupSkipIndices: [],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    vi.mocked(convertToBase).mockResolvedValue({
      baseCents: -500n,
      fxRate: 1,
      fxRateDate: '2026-04-10',
      fxSource: 'identity',
      fxStale: false,
    });

    const result = await finalizeImport({ batchId: BATCH_ID });
    expect(result).toEqual({ success: true, data: { imported: 2, skippedDuplicates: 0 } });
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

    expect(stub.rpcSpy).toHaveBeenCalledTimes(2);
    const finalize = stub.rpcSpy.mock.calls.find((c) => c[0] === 'finalize_import_batch') as
      | [string, { p_rows: unknown[] }]
      | undefined;
    expect(finalize).toBeDefined();
    if (finalize === undefined) {
      throw new Error('expected finalize_import_batch in rpc calls');
    }
    const row = finalize[1].p_rows[0] as {
      base_amount_cents: number;
      base_currency: string;
      account_ledger_cents: number;
      fx_rate: number;
      fx_rate_date: string;
      fx_stale: boolean;
    };
    expect(row.base_amount_cents).toBe(-19_558);
    expect(row.account_ledger_cents).toBe(-19_558);
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

  it('MT-4/fx-failure: batch status not modified when FX conversion throws', async () => {
    // Verifies DL audit concern: FX failure must NOT leave batch in a corrupted state
    // (status stays 'ready', not silently flipped to 'importing').
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
          amount_minor: -500,
          currency: 'USD',
          raw_description: 'Amazon',
          merchant_id: null,
          category_id: null,
        },
      ],
      profile: { base_currency: 'BAM' },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);
    const mockResolveFxRate = vi.mocked(require('@/lib/fx/convert').resolveFxRate);
    mockResolveFxRate.mockRejectedValueOnce(new Error('FX API unavailable'));

    const result = await finalizeImport({ batchId: BATCH_ID });

    expect(result).toEqual({ success: false, error: 'EXTERNAL_SERVICE_ERROR' });
    // finalize_import_batch RPC (which atomically writes status + rows) was never called.
    expect(stub.rpcSpy.mock.calls.some((c) => c[0] === 'finalize_import_batch')).toBe(false);
    // No direct status UPDATE was issued on import_batches either.
    expect(stub.batchUpdatePayloads).toHaveLength(0);
    // Storage not touched.
    expect(stub.storageRemoveSpy).not.toHaveBeenCalled();
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

  it('marks categorization as user override when category is changed', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
      },
      categoryOwner: { id: CATEGORY_ID },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      category_id: CATEGORY_ID,
    });

    expect(result).toEqual({ success: true });
    expect(stub.parsedUpdatePayloads[0]).toEqual({
      category_id: CATEGORY_ID,
      categorization_source: 'user',
      categorization_confidence: 1,
    });
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

  // ─── Learning loop wiring (F2-E4-T3) ────────────────────────────────

  it('records a correction when the user overrides a non-deterministic suggestion', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
        raw_description: 'KONZUM, BL.',
        category_id: null,
        categorization_source: 'history',
        categorization_confidence: 0.65,
      },
      categoryOwner: { id: CATEGORY_ID },
      // Below the 3-correction threshold, so no alias creation.
      correctionRows: [],
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      category_id: CATEGORY_ID,
    });

    expect(result).toEqual({ success: true });
    expect(stub.correctionInserts).toHaveLength(1);
    expect(stub.correctionInserts[0]).toEqual(
      expect.objectContaining({
        user_id: USER_ID,
        field: 'category',
        description_normalized: 'konzum bl',
        new_value: CATEGORY_ID,
        source_before: 'history',
        confidence_before: 0.65,
      }),
    );
    expect(stub.merchantInserts).toHaveLength(0);
    expect(stub.aliasInserts).toHaveLength(0);
  });

  it('does NOT learn from overrides on rule/alias_exact suggestions', async () => {
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
        raw_description: 'KONZUM BL',
        category_id: null,
        categorization_source: 'rule', // user is overriding their own rule
        categorization_confidence: 1,
      },
      categoryOwner: { id: CATEGORY_ID },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      category_id: CATEGORY_ID,
    });

    expect(result).toEqual({ success: true });
    expect(stub.correctionInserts).toHaveLength(0);
  });

  it('reports aliasCreated=true after the third matching correction', async () => {
    // Two prior corrections to the same category; this update is #3 which
    // gets recorded *before* maybeCreateAlias runs and sees three matches
    // — but our stub returns the corrections as the SELECT result, so we
    // emulate the "post-insert state" by returning three rows.
    const stub = buildSupabase({
      user: { id: USER_ID },
      parsedRow: {
        id: PARSED_ID_A,
        batch_id: BATCH_ID,
        user_id: USER_ID,
        status: 'pending_review',
        raw_description: 'KONZUM BL',
        category_id: null,
        categorization_source: 'history',
        categorization_confidence: 0.7,
      },
      categoryOwner: { id: CATEGORY_ID },
      correctionRows: [
        { new_value: CATEGORY_ID },
        { new_value: CATEGORY_ID },
        { new_value: CATEGORY_ID },
      ],
      insertedMerchant: { id: 'merchant-konzum' },
      insertedAlias: { id: 'alias-konzum' },
    });
    vi.mocked(createClient).mockResolvedValue(stub.client as never);

    const result = await updateParsedTransaction({
      id: PARSED_ID_A,
      batchId: BATCH_ID,
      category_id: CATEGORY_ID,
    });

    expect(result).toEqual({ success: true, data: { aliasCreated: true } });
    expect(stub.aliasInserts).toHaveLength(1);
    expect(stub.aliasInserts[0]).toEqual(
      expect.objectContaining({
        user_id: USER_ID,
        merchant_id: 'merchant-konzum',
        pattern_type: 'contains',
      }),
    );
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
