import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { extractReceiptFields } from './gemini-receipt';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_API_KEY = process.env.GEMINI_API_KEY;

function mockGeminiResponse(textPayload: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        candidates: [{ content: { parts: [{ text: textPayload }] } }],
      }),
    text: () => Promise.resolve(''),
    status: 200,
  };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
  vi.restoreAllMocks();
});

describe('extractReceiptFields', () => {
  const fakeImage = new Uint8Array([1, 2, 3, 4]);

  it('parses a valid Gemini JSON response into ExtractedReceipt', async () => {
    const payload = JSON.stringify({
      total_amount: 25.4,
      currency: 'BAM',
      date: '2026-04-01',
      merchant_name: 'Bingo d.o.o.',
      items: [{ name: 'Sok', total: 2.5 }],
      tax_amount: 3.68,
      confidence: 0.88,
    });
    const mock = vi.fn().mockResolvedValue(mockGeminiResponse(payload));
    global.fetch = mock;

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(true);
    expect(result.extracted.total_amount).toBe(25.4);
    expect(result.extracted.currency).toBe('BAM');
    expect(result.extracted.merchant_name).toBe('Bingo d.o.o.');
    expect(mock).toHaveBeenCalledOnce();
  });

  it('strips markdown code fences from Gemini response', async () => {
    const payload = [
      '```json',
      JSON.stringify({
        total_amount: 5,
        currency: 'EUR',
        date: '2026-04-01',
        merchant_name: 'X',
        items: [],
      }),
      '```',
    ].join('\n');
    global.fetch = vi.fn().mockResolvedValue(mockGeminiResponse(payload));

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(true);
    expect(result.extracted.currency).toBe('EUR');
  });

  it('returns ok=false with empty extracted when Gemini returns non-JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGeminiResponse('This is not JSON.'));

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(false);
    expect(result.extracted.total_amount).toBeNull();
  });

  it('salvages partial data when schema validation fails', async () => {
    const payload = JSON.stringify({
      total_amount: 12.5,
      currency: 'KM', // wrong length â€” will fail Zod
      date: '2026-04-01',
      merchant_name: 'Partial Shop',
      items: [],
    });
    global.fetch = vi.fn().mockResolvedValue(mockGeminiResponse(payload));

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(false);
    expect(result.extracted.total_amount).toBe(12.5);
    expect(result.extracted.merchant_name).toBe('Partial Shop');
    expect(result.extracted.currency).toBeNull();
  });

  it('returns ok=false gracefully when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const mock = vi.fn();
    global.fetch = mock;

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/GEMINI_API_KEY/u);
    expect(mock).not.toHaveBeenCalled();
  });

  it('returns ok=false on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
      json: () => Promise.resolve({}),
    });

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/429/u);
  });

  it('returns ok=false on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ENETDOWN'));

    const result = await extractReceiptFields(fakeImage, 'image/jpeg');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENETDOWN');
  });

  it('returns ok=false with timeout message when fetch aborts', async () => {
    // Simulate Gemini hanging: fetch rejects with AbortError when the signal fires.
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    vi.useFakeTimers();
    try {
      const promise = extractReceiptFields(fakeImage, 'image/jpeg');
      // Fast-forward past the 25 s internal timeout.
      await vi.advanceTimersByTimeAsync(26_000);
      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/predugo/u);
      expect(result.extracted.total_amount).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
