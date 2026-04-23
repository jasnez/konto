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

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverMock implements ResizeObserver {
    observe(target: Element, options?: ResizeObserverOptions) {
      void target;
      void options;
      // no-op in jsdom
    }
    unobserve(target: Element) {
      void target;
      // no-op in jsdom
    }
    disconnect() {
      // no-op in jsdom
    }
  }
  globalThis.ResizeObserver = ResizeObserverMock;
}

afterEach(() => {
  cleanup();
});
