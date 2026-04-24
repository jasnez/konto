// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ocrFallback } from '../ocr-fallback';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.MISTRAL_API_KEY;
const FAKE_BUFFER: ArrayBuffer = new Uint8Array([1, 2, 3, 4]).buffer;

function mockOkResponse(pages: { markdown: string }[]): void {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ pages }),
    text: () => Promise.resolve(''),
  });
}

function mockErrorResponse(status: number, body = ''): void {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = 'test-mistral-key';
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.MISTRAL_API_KEY;
  else process.env.MISTRAL_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe('ocrFallback', () => {
  it('vraca spojen tekst svih stranica kada API uspije', async () => {
    mockOkResponse([{ markdown: 'Stranica 1 tekst.' }, { markdown: 'Stranica 2 tekst.' }]);

    const result = await ocrFallback(FAKE_BUFFER);

    expect(result).toBe('Stranica 1 tekst.\n\nStranica 2 tekst.');
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('salje Authorization header i ispravan body', async () => {
    mockOkResponse([{ markdown: 'x' }]);

    await ocrFallback(FAKE_BUFFER);

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.mistral.ai/v1/ocr');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-mistral-key');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect((body.document as Record<string, unknown>).type).toBe('document_base64');
  });

  it('baca gresku kada MISTRAL_API_KEY nije postavljen', async () => {
    delete process.env.MISTRAL_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    await expect(ocrFallback(FAKE_BUFFER)).rejects.toThrow(/MISTRAL_API_KEY/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('baca gresku za HTTP gresku od Mistral API-ja', async () => {
    mockErrorResponse(429, 'rate limit');

    await expect(ocrFallback(FAKE_BUFFER)).rejects.toThrow(/429/u);
  });

  it('baca gresku kada odgovor nema pages polje', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: 'nesto' }),
      text: () => Promise.resolve(''),
    });

    await expect(ocrFallback(FAKE_BUFFER)).rejects.toThrow(/shemi/u);
  });

  it('baca gresku pri network greški', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('ENETDOWN'));

    await expect(ocrFallback(FAKE_BUFFER)).rejects.toThrow('ENETDOWN');
  });

  it('baca timeout gresku kada fetch odbaci AbortError', async () => {
    // Simulates what happens when the internal AbortController fires after 60s:
    // the fetch rejects with an AbortError. This avoids fake-timer leaks.
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = vi.fn().mockRejectedValueOnce(abortErr);

    await expect(ocrFallback(FAKE_BUFFER)).rejects.toThrow(/timeout/iu);
  });
});
