import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '../route';
import { runCategorizationCascade } from '@/lib/categorization/cascade';
import { extractPdfText, type ExtractResult } from '@/lib/parser/extract-text';
import { parseStatementWithLLM, type ParseResult } from '@/lib/parser/llm-parse';
import { ocrFallback } from '@/lib/parser/ocr-fallback';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/categorization/cascade', () => ({ runCategorizationCascade: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/parser/extract-text', () => ({ extractPdfText: vi.fn() }));
vi.mock('@/lib/parser/llm-parse', () => {
  // Provide a stub CircuitOpenError so route.ts instanceof checks work under mock.
  class CircuitOpenError extends Error {
    constructor() {
      super('circuit open');
      this.name = 'CircuitOpenError';
    }
  }
  return { parseStatementWithLLM: vi.fn(), CircuitOpenError };
});
vi.mock('@/lib/parser/ocr-fallback', () => ({ ocrFallback: vi.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────

interface BatchRow {
  id: string;
  account_id: string;
  storage_path: string | null;
  status: 'uploaded' | 'parsing' | 'ready' | 'imported' | 'failed';
  accounts: { institution: string | null } | null;
}

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
}

interface InsertCall {
  table: string;
  rows: Record<string, unknown>[];
}

function buildSupabaseMock(options: {
  user: { id: string } | null;
  batch: BatchRow | null;
  batchError?: { message: string } | null;
  downloadData?: Blob | null;
  downloadError?: { message: string } | null;
  insertError?: { message: string } | null;
  /** false = rate limit exceeded (F2-E5-T2). */
  allowParse?: boolean;
}) {
  const updateCalls: UpdateCall[] = [];
  const insertCalls: InsertCall[] = [];

  const download = vi.fn().mockResolvedValue({
    data: options.downloadData ?? null,
    error: options.downloadError ?? null,
  });
  const allowParse = options.allowParse ?? true;
  const rpc = vi
    .fn()
    .mockResolvedValue(allowParse ? { data: true, error: null } : { data: false, error: null });

  const from = vi.fn((table: string) => {
    if (table === 'import_batches') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: options.batch,
                  error: options.batchError ?? null,
                }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateCalls.push({ table, payload });
          return {
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        },
      };
    }
    if (table === 'parsed_transactions') {
      return {
        insert: (rows: Record<string, unknown>[]) => {
          insertCalls.push({ table, rows });
          return Promise.resolve({
            data: null,
            error: options.insertError ?? null,
          });
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: options.user } }) },
    from,
    rpc,
    storage: { from: vi.fn(() => ({ download })) },
  };

  return { client, updateCalls, insertCalls, download, rpc };
}

async function invoke(batchId: string) {
  // The Route Handler only reads `params`, so a minimal NextRequest stand-in is fine.
  const req = {} as NextRequest;
  return POST(req, { params: Promise.resolve({ batchId }) });
}

function fakePdf(): Blob {
  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });
}

const baseBatch: BatchRow = {
  id: 'batch-1',
  account_id: 'acc-1',
  storage_path: 'user-1/abc.pdf',
  status: 'uploaded',
  accounts: { institution: 'Raiffeisen' },
};

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
      description: 'BINGO MARKET SARAJEVO',
      reference: null,
    },
  ],
  confidence: 'high',
  warnings: [],
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe('POST /api/imports/[batchId]/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: download → extract → redact → LLM → insert → ready', async () => {
    const { client, updateCalls, insertCalls, download } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    vi.mocked(parseStatementWithLLM).mockResolvedValue(parsedOk);
    vi.mocked(runCategorizationCascade).mockResolvedValue({
      source: 'none',
      confidence: 0,
    });

    const res = await invoke('batch-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; count: number; confidence: string };
    expect(body).toMatchObject({ success: true, count: 1, confidence: 'high' });

    expect(download).toHaveBeenCalledWith('user-1/abc.pdf');
    expect(extractPdfText).toHaveBeenCalledTimes(1);
    expect(ocrFallback).not.toHaveBeenCalled();
    expect(parseStatementWithLLM).toHaveBeenCalledWith(expect.any(String), 'Raiffeisen');
    expect(runCategorizationCascade).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        description: 'BINGO MARKET SARAJEVO',
        userId: 'user-1',
        amountMinor: -12550,
      }),
    );

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.rows).toEqual([
      expect.objectContaining({
        batch_id: 'batch-1',
        user_id: 'user-1',
        transaction_date: '2026-04-15',
        amount_minor: -12550,
        currency: 'BAM',
        raw_description: 'BINGO MARKET SARAJEVO',
        reference: null,
        status: 'pending_review',
        parse_confidence: 'high',
        categorization_source: 'none',
        categorization_confidence: 0,
        merchant_id: null,
        category_id: null,
        selected_for_import: true,
      }),
    ]);

    // First update marks as parsing, final update sets ready with metadata.
    expect(updateCalls[0]?.payload).toEqual({ status: 'parsing' });
    expect(updateCalls.at(-1)?.payload).toEqual(
      expect.objectContaining({
        status: 'ready',
        transaction_count: 1,
        parse_confidence: 'high',
        parse_warnings: [],
        statement_period_start: null,
        statement_period_end: null,
      }),
    );
  });

  it('401 kada nema usera', async () => {
    const { client } = buildSupabaseMock({ user: null, batch: null });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await invoke('batch-1');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauth' });
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  it('404 kada batch ne postoji (ili RLS blokira)', async () => {
    const { client } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: null,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await invoke('batch-x');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('409 kada je batch već procesiran', async () => {
    const { client, updateCalls } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: { ...baseBatch, status: 'ready' },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await invoke('batch-1');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_processed' });
    expect(updateCalls).toHaveLength(0);
  });

  it('429 kada je parse rate limit prekoračen', async () => {
    const { client, updateCalls, download } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
      allowParse: false,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const res = await invoke('batch-1');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(download).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('failure path: LLM throw → status=failed + error_message', async () => {
    const { client, updateCalls, insertCalls } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    vi.mocked(parseStatementWithLLM).mockRejectedValue(new Error('gemini_timeout'));
    vi.mocked(runCategorizationCascade).mockResolvedValue({
      source: 'none',
      confidence: 0,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await invoke('batch-1');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'parse_failed' });
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls.at(-1)?.payload).toEqual({
      status: 'failed',
      error_message: 'gemini_timeout',
    });
  });

  it('OCR fallback: extract vrati hasText=false → direktan ocrFallback poziv', async () => {
    const { client, insertCalls } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractPdfText).mockResolvedValue({
      text: '',
      pageCount: 1,
      hasText: false,
      ocrUsed: false,
    });
    vi.mocked(ocrFallback).mockResolvedValue('Datum Opis Iznos 2026-04-15 RECOVERED -5,00 BAM');
    vi.mocked(parseStatementWithLLM).mockResolvedValue({
      transactions: [],
      confidence: 'low',
      warnings: ['ocr_recovered'],
    });

    const res = await invoke('batch-1');
    expect(res.status).toBe(200);
    expect(ocrFallback).toHaveBeenCalledTimes(1);
    expect(insertCalls).toHaveLength(0);
  });

  it('no text extracted → status=failed, LLM se ne poziva', async () => {
    const { client, updateCalls } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractPdfText).mockResolvedValue({
      text: '',
      pageCount: 1,
      hasText: false,
      ocrUsed: true,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await invoke('batch-1');
    expect(res.status).toBe(500);
    expect(parseStatementWithLLM).not.toHaveBeenCalled();
    expect(ocrFallback).not.toHaveBeenCalled();
    expect(updateCalls.at(-1)?.payload).toEqual({
      status: 'failed',
      error_message: 'no_text_extracted',
    });
  });

  it('insert error → status=failed', async () => {
    const { client, updateCalls } = buildSupabaseMock({
      user: { id: 'user-1' },
      batch: baseBatch,
      downloadData: fakePdf(),
      insertError: { message: 'fk_violation' },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(extractPdfText).mockResolvedValue(extractedText);
    vi.mocked(parseStatementWithLLM).mockResolvedValue(parsedOk);
    vi.mocked(runCategorizationCascade).mockResolvedValue({
      source: 'none',
      confidence: 0,
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await invoke('batch-1');
    expect(res.status).toBe(500);
    expect(updateCalls.at(-1)?.payload).toEqual({
      status: 'failed',
      error_message: 'insert_failed',
    });
  });
});
