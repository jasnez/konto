import './pdfjs-node-polyfill';

// Dead-code require: never executed at runtime, but webpack's static file
// tracer follows require() calls unconditionally, so this forces
// pdf.worker.mjs into the Vercel serverless bundle.
// pdfjs loads the worker via a dynamic import() which the tracer doesn't
// follow. PR #18 removed this block on the (incorrect) assumption that
// outputFileTracingIncludes alone was sufficient — production parse failed
// silently. DO NOT REMOVE without verifying on a Vercel preview deploy
// that PDF upload completes end-to-end without it.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (false) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('pdfjs-dist/legacy/build/pdf.worker.mjs');
}

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { ocrFallback } from './ocr-fallback';

// Resolve the worker using ESM-native import.meta.resolve() which correctly
// follows pnpm virtual-store symlinks in Vercel's serverless environment.
// import.meta.resolve() already returns a file:// URL string — pass it
// directly to workerSrc (pdfjs expects a URL, not a filesystem path).
try {
  pdfjs.GlobalWorkerOptions.workerSrc = import.meta
    .resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
} catch {
  // Worker not resolvable (e.g. deeply bundled context). pdfjs falls back
  // to inline main-thread execution — adequate for server-side text extraction.
}

export interface ExtractResult {
  text: string;
  pageCount: number;
  /** `false` kada nema dovoljno ekstraktabilnog teksta (npr. skenirani PDF). */
  hasText: boolean;
  /** `true` kada je tekst dobijen putem OCR fallback-a (Mistral), a ne direktnom ekstrakcijom. */
  ocrUsed: boolean;
}

function isTextItem(item: unknown): item is { str: string } {
  if (typeof item !== 'object' || item === null) return false;
  if (!('str' in item)) return false;
  return typeof (item as Record<string, unknown>).str === 'string';
}

/** Minimum znakova bez razmaka da smatramo da postoji pravi tekstualni sloj. */
const MIN_NON_WHITESPACE_CHARS = 50;

export async function extractPdfText(buffer: ArrayBuffer): Promise<ExtractResult> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageCount = pdf.numPages;
  const pages: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => (isTextItem(item) ? item.str : '')).join(' ');
    pages.push(pageText);
  }

  const fullText = pages.join('\n\n===PAGE_BREAK===\n\n');
  const hasText = fullText.replace(/\s/g, '').length > MIN_NON_WHITESPACE_CHARS;

  if (hasText) {
    return { text: fullText, pageCount, hasText: true, ocrUsed: false };
  }

  // Image-only PDF: delegate to Mistral OCR fallback (only when key is configured).
  if (!process.env.MISTRAL_API_KEY) {
    return { text: fullText, pageCount, hasText: false, ocrUsed: false };
  }

  try {
    const ocrText = await ocrFallback(buffer);
    const ocrHasText = ocrText.replace(/\s/g, '').length > MIN_NON_WHITESPACE_CHARS;
    return { text: ocrText, pageCount, hasText: ocrHasText, ocrUsed: true };
  } catch {
    // OCR failure is non-fatal: return the (empty) pdfjs result so the pipeline
    // can surface a user-friendly error instead of crashing.
    return { text: fullText, pageCount, hasText: false, ocrUsed: false };
  }
}
