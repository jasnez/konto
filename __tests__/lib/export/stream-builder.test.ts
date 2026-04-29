import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildExportStream } from '@/lib/export/stream-builder';
import * as exportModule from '@/lib/export/build-user-export-json';
import type { ExportHeader } from '@/lib/export/build-user-export-json';

vi.mock('@/lib/export/build-user-export-json', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export/build-user-export-json')>();
  return {
    ...actual,
    streamExportTransactions: vi.fn(),
  };
});

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

// Wraps sync chunks in an async generator. The leading await satisfies @typescript-eslint/require-await.
async function* asAsyncGen<T>(...chunks: T[][]): AsyncGenerator<T[], void, void> {
  await Promise.resolve();
  for (const chunk of chunks) yield chunk;
}

const MOCK_HEADER: ExportHeader = {
  profile: { id: 'u1', display_name: 'Test' } as never,
  accounts: [{ id: 'a1', name: 'Checking' } as never],
  categories: [],
  merchants: [],
  merchant_aliases: [],
};

const MOCK_SUPABASE = {} as never;

describe('buildExportStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces valid JSON with all 12 top-level keys for empty user', async () => {
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(() => asAsyncGen());

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const text = await collectStream(stream);
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([
      'exported_at',
      'export_version',
      'profile',
      'accounts',
      'categories',
      'merchants',
      'merchant_aliases',
      'transactions',
      'categorization_rules',
      'budgets',
      'goals',
      'recurring_transactions',
    ]);
    expect(parsed.transactions).toEqual([]);
    expect(parsed.export_version).toBe(1);
    expect(parsed.categorization_rules).toEqual([]);
  });

  it('streams a single chunk of transactions correctly', async () => {
    const txs = [
      { id: 'tx1', description: 'Coffee', amount_minor: 250 },
      { id: 'tx2', description: 'Lunch', amount_minor: 1200 },
    ];
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(() => asAsyncGen(txs));

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const text = await collectStream(stream);
    const parsed = JSON.parse(text) as { transactions: typeof txs };

    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0].id).toBe('tx1');
    expect(parsed.transactions[1].id).toBe('tx2');
  });

  it('streams multiple chunks and concatenates correctly', async () => {
    const chunk1 = [{ id: 'tx1' }, { id: 'tx2' }];
    const chunk2 = [{ id: 'tx3' }, { id: 'tx4' }];
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(() =>
      asAsyncGen(chunk1, chunk2),
    );

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const text = await collectStream(stream);
    const parsed = JSON.parse(text) as { transactions: { id: string }[] };

    expect(parsed.transactions).toHaveLength(4);
    expect(parsed.transactions.map((t) => t.id)).toEqual(['tx1', 'tx2', 'tx3', 'tx4']);
  });

  it('serializes BigInt amounts as strings', async () => {
    const txs = [{ id: 'tx1', amount_minor: BigInt('9007199254740993') }];
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(() => asAsyncGen(txs));

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const text = await collectStream(stream);
    const parsed = JSON.parse(text) as { transactions: { amount_minor: string }[] };

    expect(parsed.transactions[0].amount_minor).toBe('9007199254740993');
  });

  it('header fields are serialized in the output', async () => {
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(() => asAsyncGen());

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const text = await collectStream(stream);
    const parsed = JSON.parse(text) as Record<string, unknown>;

    expect((parsed.profile as { id: string }).id).toBe('u1');
    expect(parsed.accounts).toEqual(MOCK_HEADER.accounts);
  });

  it('signals stream error on mid-stream generator failure', async () => {
    vi.mocked(exportModule.streamExportTransactions).mockImplementation(async function* () {
      await Promise.resolve();
      yield [{ id: 'tx1' }];
      throw new Error('DB timeout mid-stream');
    });

    const stream = buildExportStream(MOCK_SUPABASE, 'u1', MOCK_HEADER);
    const reader = stream.getReader();

    await expect(async () => {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    }).rejects.toThrow('DB timeout mid-stream');
  });
});
