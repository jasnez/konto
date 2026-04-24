// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../extract-text';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, '../../../tests/fixtures/pdfs');

async function loadPdf(name: string): Promise<ArrayBuffer> {
  const b = await readFile(path.join(fixtureDir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('extractPdfText', () => {
  it('iz tekstualnog PDF-a izvlaci vise od 100 znakova', async () => {
    const buf = await loadPdf('raiffeisen-sample.pdf');
    const r = await extractPdfText(buf);
    expect(r.text.replace(/\s/g, '').length).toBeGreaterThan(100);
    expect(r.hasText).toBe(true);
  });

  it('image-only PDF: hasText je false (skener)', async () => {
    const buf = await loadPdf('image-only.pdf');
    const r = await extractPdfText(buf);
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
