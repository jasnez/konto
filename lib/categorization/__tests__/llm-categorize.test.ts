// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGenerateContent, mockConstructor } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockConstructor: vi.fn(),
}));

vi.mock('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    constructor(apiKey: string) {
      mockConstructor(apiKey);
    }
    getGenerativeModel(): { generateContent: typeof mockGenerateContent } {
      return { generateContent: mockGenerateContent };
    }
  }
  class GoogleGenerativeAIError extends Error {}
  class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  }
  class GoogleGenerativeAIAbortError extends GoogleGenerativeAIError {}
  class GoogleGenerativeAIRequestInputError extends GoogleGenerativeAIError {}
  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    GoogleGenerativeAIError,
    GoogleGenerativeAIFetchError,
    GoogleGenerativeAIAbortError,
    GoogleGenerativeAIRequestInputError,
    SchemaType: {
      STRING: 'string',
      NUMBER: 'number',
      INTEGER: 'integer',
      BOOLEAN: 'boolean',
      ARRAY: 'array',
      OBJECT: 'object',
    },
  };
});

import { amountBucketFor, llmCategorizeBatch, type LLMCategorizeItem } from '../llm-categorize';
import { categorizeCircuit } from '@/lib/parser/gemini-circuit-breaker';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

type CategorizeClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

const ORIGINAL_API_KEY = process.env.GEMINI_API_KEY;
const USER_ID = '00000000-0000-0000-0000-000000000001';
const CATEGORY_FOOD = '11111111-1111-1111-1111-111111111111';
const CATEGORY_FUEL = '22222222-2222-2222-2222-222222222222';

interface FakeRow {
  description_normalized: string;
  amount_bucket: number;
  currency: string;
  category_id: string | null;
  confidence: number;
}

interface FakeSupabaseOpts {
  cacheRows?: FakeRow[];
  categories?: { id: string; name: string; kind: string; icon: string | null }[];
  rateLimitAllowed?: boolean;
  rateLimitError?: string;
}

interface CapturedUpsert {
  rows: unknown;
  options: unknown;
}

interface FakeSupabase {
  client: CategorizeClient;
  upsertCalls: CapturedUpsert[];
  rateLimitCalls: { p_action: string; p_limit: number; p_window_seconds: number }[];
}

function makeFakeSupabase(opts: FakeSupabaseOpts): FakeSupabase {
  const cacheRows = opts.cacheRows ?? [];
  const categories = opts.categories ?? [
    { id: CATEGORY_FOOD, name: 'Hrana i piće', kind: 'expense', icon: '🍔' },
    { id: CATEGORY_FUEL, name: 'Gorivo', kind: 'expense', icon: '⛽' },
  ];

  const upsertCalls: CapturedUpsert[] = [];
  const rateLimitCalls: FakeSupabase['rateLimitCalls'] = [];

  const fromMock = vi.fn((table: string) => {
    if (table === 'llm_categorization_cache') {
      return {
        // SELECT chain (.select().eq().in().gt())
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({ data: cacheRows, error: null }),
            }),
          }),
        }),
        // upsert call: { rows, options } captured for assertions
        upsert: vi.fn((rows: unknown, options: unknown) => {
          upsertCalls.push({ rows, options });
          return Promise.resolve({ error: null });
        }),
      };
    }
    if (table === 'categories') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: categories, error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unmocked table: ${table}`);
  });

  const rpcMock = vi.fn((fn: string, params: Record<string, unknown>) => {
    if (fn === 'check_rate_limit_and_record') {
      rateLimitCalls.push({
        p_action: String(params.p_action),
        p_limit: Number(params.p_limit),
        p_window_seconds: Number(params.p_window_seconds),
      });
      if (opts.rateLimitError) {
        return Promise.resolve({ data: null, error: { message: opts.rateLimitError } });
      }
      return Promise.resolve({ data: opts.rateLimitAllowed ?? true, error: null });
    }
    throw new Error(`Unmocked RPC: ${fn}`);
  });

  return {
    client: { from: fromMock, rpc: rpcMock } as unknown as CategorizeClient,
    upsertCalls,
    rateLimitCalls,
  };
}

function mockGeminiResults(payload: {
  results: { categoryId: string | null; confidence: number }[];
}): void {
  mockGenerateContent.mockResolvedValueOnce({
    response: { text: () => JSON.stringify(payload) },
  });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGenerateContent.mockReset();
  mockConstructor.mockReset();
  categorizeCircuit._reset();
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
  categorizeCircuit._reset();
});

describe('amountBucketFor', () => {
  it('rounds small amounts to nearest 5000', () => {
    expect(amountBucketFor(0)).toBe(0);
    expect(amountBucketFor(2_499)).toBe(0);
    expect(amountBucketFor(2_500)).toBe(5_000);
    expect(amountBucketFor(7_499)).toBe(5_000);
    expect(amountBucketFor(7_500)).toBe(10_000);
    expect(amountBucketFor(95_000)).toBe(95_000);
    expect(amountBucketFor(100_000)).toBe(100_000);
  });

  it('rounds large amounts to nearest 50000', () => {
    expect(amountBucketFor(150_000)).toBe(150_000);
    expect(amountBucketFor(174_999)).toBe(150_000);
    expect(amountBucketFor(175_000)).toBe(200_000);
  });

  it('preserves sign so refunds bucket separately from expenses', () => {
    expect(amountBucketFor(-7_500)).toBe(-10_000);
    expect(amountBucketFor(7_500)).toBe(10_000);
  });
});

describe('llmCategorizeBatch', () => {
  it('returns empty array for empty input without touching Gemini', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    const out = await llmCategorizeBatch(fake.client, USER_ID, []);
    expect(out).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fake.rateLimitCalls).toHaveLength(0);
  });

  it('happy path: batches uncategorised rows and assigns categoryId for confidence ≥ 0.6', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    mockGeminiResults({
      results: [
        { categoryId: CATEGORY_FOOD, confidence: 0.92 },
        { categoryId: CATEGORY_FUEL, confidence: 0.81 },
      ],
    });

    const items: LLMCategorizeItem[] = [
      { description: 'BINGO MARKET SARAJEVO', amountMinor: -8_500, currency: 'BAM' },
      { description: 'PETROL ZENICA', amountMinor: -12_000, currency: 'BAM' },
    ];
    const out = await llmCategorizeBatch(fake.client, USER_ID, items);

    expect(out).toHaveLength(2);
    expect(out[0]?.categoryId).toBe(CATEGORY_FOOD);
    expect(out[0]?.source).toBe('llm');
    expect(out[1]?.categoryId).toBe(CATEGORY_FUEL);
    expect(out[1]?.source).toBe('llm');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    // Cache write happens once with both rows.
    expect(fake.upsertCalls).toHaveLength(1);
    expect(Array.isArray(fake.upsertCalls[0]?.rows)).toBe(true);
    expect((fake.upsertCalls[0]?.rows as unknown[]).length).toBe(2);
  });

  it('cache hit short-circuits without calling Gemini or rate limit', async () => {
    const fake = makeFakeSupabase({
      rateLimitAllowed: true,
      cacheRows: [
        {
          description_normalized: 'bingo market sarajevo',
          amount_bucket: -10_000, // -8500 rounds to nearest 5000 → -10000
          currency: 'BAM',
          category_id: CATEGORY_FOOD,
          confidence: 0.95,
        },
      ],
    });

    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'BINGO MARKET SARAJEVO', amountMinor: -8_500, currency: 'BAM' },
    ]);

    expect(out[0]?.categoryId).toBe(CATEGORY_FOOD);
    expect(out[0]?.source).toBe('llm_cache');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fake.rateLimitCalls).toHaveLength(0); // not even the rate limit was consulted
  });

  it('rate limit exceeded → all rows return source=none, no Gemini call', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: false });
    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'NEPOZNATI TRGOVAC', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.source).toBe('none');
    expect(out[0]?.categoryId).toBeNull();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fake.rateLimitCalls[0]?.p_action).toBe('llm_categorize');
    expect(fake.rateLimitCalls[0]?.p_limit).toBe(50);
  });

  it('confidence < 0.6 → categoryId=null but source=llm (so we know we tried)', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    mockGeminiResults({
      results: [{ categoryId: CATEGORY_FOOD, confidence: 0.4 }],
    });

    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'NEPOZNATI MERCHANT', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.source).toBe('llm');
    expect(out[0]?.categoryId).toBeNull();
    expect(out[0]?.confidence).toBe(0.4);
  });

  it('rejects categoryId not in the user category set (model hallucinated)', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    mockGeminiResults({
      results: [{ categoryId: 'not-a-real-category-uuid', confidence: 0.95 }],
    });

    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'NEPOZNATI MERCHANT', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.categoryId).toBeNull();
    expect(out[0]?.source).toBe('llm');
  });

  it('Gemini error → trips circuit, returns source=none, never throws', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini transient failure'));

    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'NEPOZNATI MERCHANT', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.source).toBe('none');
    // Circuit breaker counted one failure.
    expect(categorizeCircuit.getState()).toBe('CLOSED');
  });

  it('open categorize circuit short-circuits without Gemini call', async () => {
    // Trip the circuit ahead of time (3 consecutive failures).
    categorizeCircuit.onFailure();
    categorizeCircuit.onFailure();
    categorizeCircuit.onFailure();
    expect(categorizeCircuit.getState()).toBe('OPEN');

    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'X', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.source).toBe('none');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('dedups identical descriptions in the same batch (one Gemini slot, both rows resolved)', async () => {
    const fake = makeFakeSupabase({ rateLimitAllowed: true });
    mockGeminiResults({
      results: [{ categoryId: CATEGORY_FOOD, confidence: 0.9 }],
    });

    const items: LLMCategorizeItem[] = [
      { description: 'BINGO MARKET', amountMinor: -7_500, currency: 'BAM' },
      // Same normalised description + bucket → only one Gemini slot used.
      { description: 'bingo market', amountMinor: -7_500, currency: 'BAM' },
    ];
    const out = await llmCategorizeBatch(fake.client, USER_ID, items);

    expect(out[0]?.categoryId).toBe(CATEGORY_FOOD);
    expect(out[1]?.categoryId).toBe(CATEGORY_FOOD);

    // Verify the prompt only had one transaction (Gemini received 1, not 2)
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as unknown as string;
    const parsed = JSON.parse(promptArg) as { transactions: unknown[] };
    expect(parsed.transactions).toHaveLength(1);
  });

  it('user with no eligible categories → bail without Gemini call', async () => {
    const fake = makeFakeSupabase({
      rateLimitAllowed: true,
      categories: [],
    });

    const out = await llmCategorizeBatch(fake.client, USER_ID, [
      { description: 'X', amountMinor: -7_000, currency: 'BAM' },
    ]);

    expect(out[0]?.source).toBe('none');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
