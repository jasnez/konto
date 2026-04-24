// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOcrFallback } = vi.hoisted(() => ({ mockOcrFallback: vi.fn() }));

vi.mock('../ocr-fallback', () => ({
  ocrFallback: mockOcrFallback,
}));

import { extractPdfText } from '../extract-text';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../../../tests/fixtures/pdfs');

const ORIGINAL_KEY = process.env.MISTRAL_API_KEY;

async function loadPdf(name: string): Promise<ArrayBuffer> {
  const b = await readFile(path.join(fixtureDir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

beforeEach(() => {
  mockOcrFallback.mockReset();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MISTRAL_API_KEY;
  else process.env.MISTRAL_API_KEY = ORIGINAL_KEY;
});

describe('extractPdfText', () => {
  it('iz tekstualnog PDF-a izvlaci vise od 100 znakova', async () => {
    const buf = await loadPdf('raiffeisen-sample.pdf');
    const r = await extractPdfText(buf);
    expect(r.text.replace(/\s/g, '').length).toBeGreaterThan(100);
    expect(r.hasText).toBe(true);
    expect(r.ocrUsed).toBe(false);
  });

  it('tekstualni PDF: OCR se NE poziva cak ni kad postoji MISTRAL_API_KEY', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';

    const buf = await loadPdf('raiffeisen-sample.pdf');
    await extractPdfText(buf);

    expect(mockOcrFallback).not.toHaveBeenCalled();
  });

  it('image-only PDF bez MISTRAL_API_KEY: hasText je false, ocrUsed je false', async () => {
    delete process.env.MISTRAL_API_KEY;
    const buf = await loadPdf('image-only.pdf');
    const r = await extractPdfText(buf);

    expect(r.hasText).toBe(false);
    expect(r.ocrUsed).toBe(false);
    expect(mockOcrFallback).not.toHaveBeenCalled();
  });

  it('image-only PDF sa MISTRAL_API_KEY: OCR se poziva i ocrUsed je true', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    mockOcrFallback.mockResolvedValueOnce(
      'Izvod Raiffeisen banka BINGO MARKET -125,50 BAM 15.04.2026.',
    );

    const buf = await loadPdf('image-only.pdf');
    const r = await extractPdfText(buf);

    expect(r.ocrUsed).toBe(true);
    expect(r.hasText).toBe(true);
    expect(r.text).toContain('Raiffeisen');
    expect(mockOcrFallback).toHaveBeenCalledOnce();
  });

  it('image-only PDF: OCR greška je non-fatal, vraca prazan tekst', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    mockOcrFallback.mockRejectedValueOnce(new Error('Mistral OCR greška (HTTP 503)'));

    const buf = await loadPdf('image-only.pdf');
    const r = await extractPdfText(buf);

    expect(r.ocrUsed).toBe(false);
    expect(r.hasText).toBe(false);
  });

  it('pageCount odgovara fixture fajlu', async () => {
    const r1 = await extractPdfText(await loadPdf('raiffeisen-sample.pdf'));
    expect(r1.pageCount).toBe(3);

    const r2 = await extractPdfText(await loadPdf('image-only.pdf'));
    expect(r2.pageCount).toBe(1);

    const r3 = await extractPdfText(await loadPdf('five-page-text.pdf'));
    expect(r3.pageCount).toBe(5);
  });

  it('5 stranica: ekstrakcija ispod 3s', async () => {
    const buf = await loadPdf('five-page-text.pdf');
    const t0 = performance.now();
    await extractPdfText(buf);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
  });
});
