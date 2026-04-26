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
  // Export real-looking error classes so with-retry.ts instanceof checks work.
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

import { parseStatementWithLLM, ParseResultSchema } from '../llm-parse';
import { _resetCircuit } from '../gemini-circuit-breaker';

const ORIGINAL_API_KEY = process.env.GEMINI_API_KEY;
const LONG_TEXT = 'Datum 15.04.2026 Iznos 125,50 BAM opis MARKET SARAJEVO\n'.repeat(5);

function mockLLMResponse(payload: unknown): void {
  mockGenerateContent.mockResolvedValueOnce({
    response: { text: () => JSON.stringify(payload) },
  });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  mockGenerateContent.mockReset();
  mockConstructor.mockReset();
  // Reset circuit breaker so each test starts with a clean CLOSED state.
  _resetCircuit();
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
});

describe('parseStatementWithLLM (mocked SDK)', () => {
  it('parsira validan odgovor i rezultat prolazi Zod validaciju', async () => {
    mockLLMResponse({
      transactions: [
        {
          date: '2026-04-15',
          amountMinor: -12550,
          currency: 'BAM',
          description: 'BINGO MARKET SARAJEVO',
          reference: 'REF-123',
        },
        {
          date: '2026-04-20',
          amountMinor: 250000,
          currency: 'BAM',
          description: 'PLATA',
        },
      ],
      statementPeriodStart: '2026-04-01',
      statementPeriodEnd: '2026-04-30',
      confidence: 'high',
      warnings: [],
    });

    const result = await parseStatementWithLLM(LONG_TEXT);
    const validation = ParseResultSchema.safeParse(result);

    expect(validation.success).toBe(true);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]?.amountMinor).toBe(-12550);
    expect(result.transactions[0]?.currency).toBe('BAM');
    expect(result.confidence).toBe('high');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
  });

  it('prazan izvod vraca transactions=[] i confidence=low bez LLM poziva', async () => {
    const result = await parseStatementWithLLM('');

    expect(result.transactions).toEqual([]);
    expect(result.confidence).toBe('low');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('baca gresku kada GEMINI_API_KEY nije postavljen', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(parseStatementWithLLM(LONG_TEXT)).rejects.toThrow(/GEMINI_API_KEY/u);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('baca gresku kada LLM vrati JSON koji ne prolazi Zod schemu', async () => {
    mockLLMResponse({ nesto: 'drugo' });
    await expect(parseStatementWithLLM(LONG_TEXT)).rejects.toThrow();
  });

  it('baca gresku kada odgovor nije validan JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'not json at all' },
    });
    await expect(parseStatementWithLLM(LONG_TEXT)).rejects.toThrow(SyntaxError);
  });

  it('normalizuje currency u velika slova (zod transform)', async () => {
    mockLLMResponse({
      transactions: [
        {
          date: '2026-04-15',
          amountMinor: -1000,
          currency: 'bam',
          description: 'x',
        },
      ],
      confidence: 'medium',
      warnings: [],
    });

    const result = await parseStatementWithLLM(LONG_TEXT);
    expect(result.transactions[0]?.currency).toBe('BAM');
  });

  it('prosljedjuje bank hint u user message i inicijalizuje SDK s API key-em', async () => {
    mockLLMResponse({ transactions: [], confidence: 'low', warnings: [] });

    await parseStatementWithLLM(LONG_TEXT, 'Raiffeisen BH');

    expect(mockConstructor).toHaveBeenCalledWith('test-key');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const firstArg: unknown = mockGenerateContent.mock.calls[0]?.[0];
    expect(String(firstArg)).toContain('Raiffeisen BH');
  });
});

// Live Gemini API E2E se nalazi u posebnom `llm-parse.e2e.test.ts` da se izbjegne
// kolizija sa vi.mock (koji je hoistovan globalno na nivou fajla).
