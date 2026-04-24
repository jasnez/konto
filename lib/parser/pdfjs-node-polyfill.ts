/**
 * pdfjs-dist legacy build expects browser globals at module load time.
 * In Node (Next server, Vitest), install shims before importing `pdf.mjs`.
 */
import DOMMatrix from '@thednp/dommatrix';

if (typeof globalThis.DOMMatrix === 'undefined') {
  // @thednp/dommatrix is structurally compatible; DOM lib type expects browser constructor.
  globalThis.DOMMatrix = DOMMatrix as unknown as typeof globalThis.DOMMatrix;
}
