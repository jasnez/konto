import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCategorizationCascade } from '@/lib/categorization/cascade';
import { extractPdfText, type ExtractResult } from '@/lib/parser/extract-text';
import { parseStatementWithLLM, type ParseResult } from '@/lib/parser/llm-parse';
import { ocrFallback } from '@/lib/parser/ocr-fallback';
import { ParsePipelineError, runParsePipeline } from '../parse-pipeline';

vi.mock('@/lib/categorization/cascade', () => ({ runCategorizationCascade: vi.fn() }));
vi.mock('@/lib/parser/extract-text', () => ({ extractPdfText: vi.fn() }));
vi.mock('@/lib/parser/llm-parse', () => {
  class CircuitOpenError extends Error {
    constructor() {
      super('circuit open');
      this.name = 'CircuitOpenError';
    }
  }
  return { parseStatementWithLLM: vi.fn(), CircuitOpenError };
});
vi.mock('@/lib/parser/ocr-fallback', () => ({ ocrFallback: vi.fn() }));

interface InsertCall {
  table: string;
  rows: Record<string, unknown>[];
}
interface UpdateCall {
  payload: Record<string, unknown>;
}

function buildClient(opts: {
  downloadData?: Blob | null;
  downloadError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const inserts: InsertCall[] = [];
  const updates: UpdateCall[] = [];
  const download = vi.fn().mockResolvedValue({
    data: opts.downloadData ?? null,
    error: opts.downloadError ?? null,
  });

  const from = vi.fn((table: string) => {
    if (table === 'parsed_transactions') {
      return {
        insert: (rows: Record<string, unknown>[]) => {
          inserts.push({ table, rows });
          return Promise.resolve({ data: null, error: opts.insertError ?? null });
        },
      };
    }
    if (table === 'import_batches') {
      return {
        update: (payload: Record<string, unknown>) => {
          updates.push({ payload });
          return {
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: opts.updateError ?? null }),
            }),
          };
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  const client = {
    from,
    storage: { from: vi.fn(() => ({ download })) },
  };

  return { client, inserts, updates, download };
}

const fakePdf = () =>
  new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

const extractedText: ExtractResult = {
  text: 'Datum Opis Iznos 2026-04-15 BINGO -125,50 BAM',
  pageCount: 1,
  hasText: true,
  ocrUsed: false,
};

const parsedOk: ParseResult = {
  transactions: [
    {
      date: '2026-04-15',
      amountMinor: -12550,
      currency: 'BAM',
      description: 'BINGO',
      reference: null,
    },
  ],
  confidence: 'high',
  warnings: [],
};

describe('runParsePipeline', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('happy path: download → extract → LLM → insert → ready update', async () => {
    const { client, inserts, updates, download } = buildClient({ downloadData: fakePdf() });
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    vi.mocked(parseStatementWithLLM).mockResolvedValue(parsedOk);
    vi.mocked(runCategorizationCascade).mockResolvedValue({ source: 'none', confidence: 0 });

    const result = await runParsePipeline(client as never, {
      batchId: 'b1',
      userId: 'u1',
      storagePath: 'u1/x.pdf',
      bankHint: 'Raiffeisen',
    });

    expect(result).toEqual({ count: 1, confidence: 'high', warnings: [] });
    expect(download).toHaveBeenCalledWith('u1/x.pdf');
    expect(parseStatementWithLLM).toHaveBeenCalledWith(expect.any(String), 'Raiffeisen');
    expect(inserts).toHaveLength(1);
    expect(updates.at(-1)?.payload).toEqual(
      expect.objectContaining({
        status: 'ready',
        transaction_count: 1,
        parse_confidence: 'high',
      }),
    );
  });

  it('throws ParsePipelineError(pdf_not_found) on download failure', async () => {
    const { client } = buildClient({ downloadError: { message: 'NoSuchKey' } });
    await expect(
      runParsePipeline(client as never, {
        batchId: 'b1',
        userId: 'u1',
        storagePath: 'u1/x.pdf',
      }),
    ).rejects.toMatchObject({
      name: 'ParsePipelineError',
      code: 'pdf_not_found',
    });
  });

  it('throws no_text_extracted when extract+OCR both empty', async () => {
    const { client } = buildClient({ downloadData: fakePdf() });
    vi.mocked(extractPdfText).mockResolvedValue({
      text: '',
      pageCount: 1,
      hasText: false,
      ocrUsed: false,
    });
    vi.mocked(ocrFallback).mockResolvedValue('   ');
    await expect(
      runParsePipeline(client as never, {
        batchId: 'b1',
        userId: 'u1',
        storagePath: 'u1/x.pdf',
      }),
    ).rejects.toMatchObject({ code: 'no_text_extracted' });
  });

  it('translates CircuitOpenError to service_unavailable', async () => {
    const { client } = buildClient({ downloadData: fakePdf() });
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    const llm = await import('@/lib/parser/llm-parse');
    vi.mocked(parseStatementWithLLM).mockRejectedValue(new llm.CircuitOpenError());

    await expect(
      runParsePipeline(client as never, {
        batchId: 'b1',
        userId: 'u1',
        storagePath: 'u1/x.pdf',
      }),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });

  it('throws insert_failed when staging insert errors', async () => {
    const { client } = buildClient({
      downloadData: fakePdf(),
      insertError: { message: 'fk_violation' },
    });
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    vi.mocked(parseStatementWithLLM).mockResolvedValue(parsedOk);
    vi.mocked(runCategorizationCascade).mockResolvedValue({ source: 'none', confidence: 0 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runParsePipeline(client as never, {
        batchId: 'b1',
        userId: 'u1',
        storagePath: 'u1/x.pdf',
      }),
    ).rejects.toBeInstanceOf(ParsePipelineError);
  });
});
