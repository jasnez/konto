import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof Element !== 'undefined') {
  const p = Element.prototype as unknown as Record<string, unknown>;
  if (typeof p.hasPointerCapture !== 'function') {
    p.hasPointerCapture = () => false;
    p.setPointerCapture = () => undefined;
    p.releasePointerCapture = () => undefined;
  }
  if (typeof p.scrollIntoView !== 'function') {
    p.scrollIntoView = () => undefined;
  }
}

afterEach(() => {
  cleanup();
});
