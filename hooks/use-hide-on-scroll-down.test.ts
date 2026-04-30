import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHideOnScrollDown } from './use-hide-on-scroll-down';

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
}

function flushRaf() {
  // jsdom requestAnimationFrame fires synchronously when called directly via
  // setTimeout in the polyfill; flush one tick.
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

describe('useHideOnScrollDown', () => {
  beforeEach(() => {
    setScrollY(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    setScrollY(0);
  });

  it('starts visible (hidden=false) on initial mount', () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    expect(result.current).toBe(false);
  });

  it('stays visible while scrollY is below the reveal threshold (64px default)', async () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    await act(async () => {
      setScrollY(50);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(false);
  });

  it('hides when scrolling down past the threshold', async () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    await act(async () => {
      setScrollY(100);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
      setScrollY(150);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(true);
  });

  it('reveals when scrolling up after being hidden', async () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    await act(async () => {
      setScrollY(150);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
      setScrollY(200);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(true);

    await act(async () => {
      setScrollY(150);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(false);
  });

  it('reveals immediately when scrolled back near the top regardless of direction', async () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    await act(async () => {
      setScrollY(200);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
      setScrollY(250);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(true);

    await act(async () => {
      setScrollY(30);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(false);
  });

  it('respects custom revealThresholdPx', async () => {
    const { result } = renderHook(() => useHideOnScrollDown({ revealThresholdPx: 200 }));
    await act(async () => {
      setScrollY(150);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
      setScrollY(180);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    // 180 < 200 threshold → still visible despite scrolling down
    expect(result.current).toBe(false);
  });

  it('ignores small jitter below deltaPx (deadband)', async () => {
    // Mount with scroll already at 100 so the hook's lastY=100 from the start.
    // (lastY is captured inside the effect's closure on mount.)
    setScrollY(100);
    const { result } = renderHook(() => useHideOnScrollDown({ deltaPx: 10 }));
    await act(async () => {
      // Tiny +5px nudge — less than 10px deadband, neither branch should trigger.
      setScrollY(105);
      window.dispatchEvent(new Event('scroll'));
      await flushRaf();
    });
    expect(result.current).toBe(false);
  });
});
