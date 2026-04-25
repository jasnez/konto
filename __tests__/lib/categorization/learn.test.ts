import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type LearnClient,
  LEARNING_THRESHOLD,
  maybeCreateAlias,
  recordCorrection,
} from '@/lib/categorization/learn';

// ─── Thenable chain builder ───────────────────────────────────────────
//
// Mirrors the builder in __tests__/actions/imports.test.ts: each chainable
// call returns the same builder; the builder is awaitable via `.then`. We
// support per-method terminal overrides so the user_corrections SELECT can
// return one shape while a merchants SELECT returns another.

interface QueryResult<T = unknown> {
  data: T;
  error: { message: string } | null;
}

function makeBuilder<T>(
  terminal: QueryResult<T>,
  overrides: Partial<Record<'maybeSingle' | 'single', QueryResult>> = {},
): unknown {
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
  builder.maybeSingle = () => Promise.resolve(overrides.maybeSingle ?? terminal);
  builder.single = () => Promise.resolve(overrides.single ?? terminal);
  builder.then = (resolve: (value: QueryResult<T>) => unknown) =>
    Promise.resolve(terminal).then(resolve);
  return builder;
}

// ─── Stub state ───────────────────────────────────────────────────────

interface CorrectionRow {
  new_value: string | null;
}

interface MerchantRow {
  id: string;
  default_category_id: string | null;
  canonical_name: string;
}

interface MerchantAliasRow {
  id: string;
  merchant_id: string;
  pattern: string;
}

interface StubOptions {
  /** Rows the SELECT against `user_corrections` returns. */
  corrections?: CorrectionRow[];
  /** Existing merchants (matched by ilike on canonical_name in real life). */
  merchants?: MerchantRow[];
  /** Existing aliases for the user. */
  aliases?: MerchantAliasRow[];
  /** Force the merchants insert to return this row. */
  insertedMerchant?: { id: string };
  /** Force the alias insert to return this row. */
  insertedAlias?: { id: string };
  /** Make the user_corrections insert fail. */
  failCorrectionInsert?: boolean;
  /** Make the merchants insert fail. */
  failMerchantInsert?: boolean;
  /** Make the alias insert fail. */
  failAliasInsert?: boolean;
}

interface Stub {
  client: LearnClient;
  correctionInserts: Record<string, unknown>[];
  merchantInserts: Record<string, unknown>[];
  merchantUpdates: Record<string, unknown>[];
  aliasInserts: Record<string, unknown>[];
}

function buildStub(options: StubOptions = {}): Stub {
  const correctionInserts: Record<string, unknown>[] = [];
  const merchantInserts: Record<string, unknown>[] = [];
  const merchantUpdates: Record<string, unknown>[] = [];
  const aliasInserts: Record<string, unknown>[] = [];

  const from = (table: string): unknown => {
    if (table === 'user_corrections') {
      return {
        select: () =>
          makeBuilder({
            data: options.corrections ?? [],
            error: null,
          }),
        insert: (payload: Record<string, unknown>) => {
          correctionInserts.push(payload);
          return makeBuilder({
            data: null,
            error: options.failCorrectionInsert ? { message: 'pg fail' } : null,
          });
        },
      };
    }

    if (table === 'merchants') {
      return {
        select: () =>
          makeBuilder({
            data: options.merchants ?? [],
            error: null,
          }),
        insert: (payload: Record<string, unknown>) => {
          merchantInserts.push(payload);
          return makeBuilder(
            { data: null, error: null },
            {
              single: options.failMerchantInsert
                ? { data: null, error: { message: 'merchant insert fail' } }
                : { data: options.insertedMerchant ?? { id: 'merchant-new' }, error: null },
            },
          );
        },
        update: (payload: Record<string, unknown>) => {
          merchantUpdates.push(payload);
          return makeBuilder({ data: null, error: null });
        },
      };
    }

    if (table === 'merchant_aliases') {
      return {
        select: () =>
          makeBuilder({
            data: options.aliases ?? [],
            error: null,
          }),
        insert: (payload: Record<string, unknown>) => {
          aliasInserts.push(payload);
          return makeBuilder(
            { data: null, error: null },
            {
              single: options.failAliasInsert
                ? { data: null, error: { message: 'alias insert fail' } }
                : { data: options.insertedAlias ?? { id: 'alias-new' }, error: null },
            },
          );
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return {
    client: { from } as unknown as LearnClient,
    correctionInserts,
    merchantInserts,
    merchantUpdates,
    aliasInserts,
  };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_FOOD = '22222222-2222-4222-8222-222222222222';
const CATEGORY_UTIL = '33333333-3333-4333-8333-333333333333';
const CATEGORY_OTHER = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── recordCorrection ────────────────────────────────────────────────

describe('recordCorrection', () => {
  it('writes a normalised correction row for category overrides', async () => {
    const stub = buildStub();
    const result = await recordCorrection(stub.client, {
      userId: USER_ID,
      originalDescription: '  KONZUM, BL.  ',
      newCategoryId: CATEGORY_FOOD,
      oldCategoryId: null,
      sourceBefore: 'history',
      confidenceBefore: 0.65,
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedDescription).toBe('konzum bl');
    expect(stub.correctionInserts).toHaveLength(1);
    expect(stub.correctionInserts[0]).toEqual({
      user_id: USER_ID,
      field: 'category',
      description_raw: 'KONZUM, BL.',
      description_normalized: 'konzum bl',
      new_value: CATEGORY_FOOD,
      old_value: null,
      source_before: 'history',
      confidence_before: 0.65,
      transaction_id: null,
    });
  });

  it('returns ok=false and skips the insert for blank descriptions', async () => {
    const stub = buildStub();
    const result = await recordCorrection(stub.client, {
      userId: USER_ID,
      originalDescription: '   ',
      newCategoryId: CATEGORY_FOOD,
    });

    expect(result.ok).toBe(false);
    expect(result.normalizedDescription).toBe('');
    expect(stub.correctionInserts).toHaveLength(0);
  });

  it('records corrections that clear the category (new_value = null)', async () => {
    const stub = buildStub();
    const result = await recordCorrection(stub.client, {
      userId: USER_ID,
      originalDescription: 'Konzum BL',
      newCategoryId: null,
    });

    expect(result.ok).toBe(true);
    const inserted = stub.correctionInserts[0];
    expect(inserted).toBeDefined();
    expect((inserted as { new_value: unknown }).new_value).toBeNull();
  });

  it('returns ok=false but still resolves when the insert fails', async () => {
    const stub = buildStub({ failCorrectionInsert: true });
    const result = await recordCorrection(stub.client, {
      userId: USER_ID,
      originalDescription: 'Konzum BL',
      newCategoryId: CATEGORY_FOOD,
    });
    expect(result.ok).toBe(false);
    expect(result.normalizedDescription).toBe('konzum bl');
  });
});

// ─── maybeCreateAlias ────────────────────────────────────────────────

describe('maybeCreateAlias', () => {
  it('does nothing after a single correction', async () => {
    const stub = buildStub({
      corrections: [{ new_value: CATEGORY_FOOD }],
    });
    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({ created: false, reason: 'BELOW_THRESHOLD' });
    expect(stub.merchantInserts).toHaveLength(0);
    expect(stub.aliasInserts).toHaveLength(0);
  });

  it(`creates an alias once the threshold (${String(LEARNING_THRESHOLD)}) is reached for the same category`, async () => {
    const stub = buildStub({
      corrections: Array.from({ length: LEARNING_THRESHOLD }, () => ({
        new_value: CATEGORY_FOOD,
      })),
      insertedMerchant: { id: 'merchant-konzum' },
      insertedAlias: { id: 'alias-konzum' },
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: '  Konzum BL  ',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({
      created: true,
      aliasId: 'alias-konzum',
      merchantId: 'merchant-konzum',
    });
    expect(stub.merchantInserts).toHaveLength(1);
    expect(stub.merchantInserts[0]).toEqual({
      user_id: USER_ID,
      canonical_name: 'Konzum BL',
      display_name: 'Konzum BL',
      default_category_id: CATEGORY_FOOD,
    });
    expect(stub.aliasInserts).toHaveLength(1);
    expect(stub.aliasInserts[0]).toEqual({
      user_id: USER_ID,
      merchant_id: 'merchant-konzum',
      pattern: 'Konzum BL',
      pattern_type: 'contains',
    });
  });

  it('refuses to create an alias when the same description maps to multiple categories at threshold', async () => {
    // Three corrections to FOOD and three to UTIL — ambiguous, no alias.
    const stub = buildStub({
      corrections: [
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_UTIL },
        { new_value: CATEGORY_UTIL },
        { new_value: CATEGORY_UTIL },
      ],
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({ created: false, reason: 'AMBIGUOUS' });
    expect(stub.merchantInserts).toHaveLength(0);
    expect(stub.aliasInserts).toHaveLength(0);
  });

  it('does not count corrections to other categories against the threshold', async () => {
    // 3x FOOD, 1x UTIL, 1x OTHER — FOOD wins cleanly.
    const stub = buildStub({
      corrections: [
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_FOOD },
        { new_value: CATEGORY_UTIL },
        { new_value: CATEGORY_OTHER },
      ],
      insertedAlias: { id: 'alias-1' },
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toMatchObject({ created: true });
  });

  it('reuses an existing merchant by case-insensitive canonical name match', async () => {
    const stub = buildStub({
      corrections: Array.from({ length: LEARNING_THRESHOLD }, () => ({
        new_value: CATEGORY_FOOD,
      })),
      merchants: [
        {
          id: 'merchant-existing',
          canonical_name: 'konzum bl',
          default_category_id: CATEGORY_FOOD,
        },
      ],
      insertedAlias: { id: 'alias-existing-merchant' },
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({
      created: true,
      aliasId: 'alias-existing-merchant',
      merchantId: 'merchant-existing',
    });
    expect(stub.merchantInserts).toHaveLength(0);
    expect(stub.merchantUpdates).toHaveLength(0);
    expect(stub.aliasInserts[0]).toMatchObject({ merchant_id: 'merchant-existing' });
  });

  it('backfills default_category_id on a reused merchant that has none', async () => {
    const stub = buildStub({
      corrections: Array.from({ length: LEARNING_THRESHOLD }, () => ({
        new_value: CATEGORY_FOOD,
      })),
      merchants: [
        {
          id: 'merchant-bare',
          canonical_name: 'Konzum BL',
          default_category_id: null,
        },
      ],
      insertedAlias: { id: 'alias-1' },
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result.created).toBe(true);
    expect(stub.merchantUpdates).toHaveLength(1);
    expect(stub.merchantUpdates[0]).toEqual({ default_category_id: CATEGORY_FOOD });
  });

  it('skips alias creation if an alias already exists for the normalised pattern', async () => {
    const stub = buildStub({
      corrections: Array.from({ length: LEARNING_THRESHOLD }, () => ({
        new_value: CATEGORY_FOOD,
      })),
      aliases: [
        {
          id: 'alias-old',
          merchant_id: 'merchant-old',
          pattern: 'KONZUM, BL.', // same after normalisation
        },
      ],
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({ created: false, reason: 'ALIAS_EXISTS' });
    expect(stub.merchantInserts).toHaveLength(0);
    expect(stub.aliasInserts).toHaveLength(0);
  });

  it('returns EMPTY for blank descriptions or category ids', async () => {
    const stub = buildStub();
    expect(
      await maybeCreateAlias(stub.client, {
        userId: USER_ID,
        description: '   ',
        categoryId: CATEGORY_FOOD,
      }),
    ).toEqual({ created: false, reason: 'EMPTY' });
    expect(
      await maybeCreateAlias(stub.client, {
        userId: USER_ID,
        description: 'Konzum',
        categoryId: '',
      }),
    ).toEqual({ created: false, reason: 'EMPTY' });
  });

  it('reports ERROR when the alias insert fails', async () => {
    const stub = buildStub({
      corrections: Array.from({ length: LEARNING_THRESHOLD }, () => ({
        new_value: CATEGORY_FOOD,
      })),
      failAliasInsert: true,
    });

    const result = await maybeCreateAlias(stub.client, {
      userId: USER_ID,
      description: 'Konzum BL',
      categoryId: CATEGORY_FOOD,
    });

    expect(result).toEqual({ created: false, reason: 'ERROR' });
  });
});
