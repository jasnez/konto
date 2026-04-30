import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePullToRefresh } from './use-pull-to-refresh';

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
}

interface PartialTouch {
  clientX: number;
  clientY: number;
}

function makeTouchEvent(touches: PartialTouch[]): React.TouchEvent<HTMLElement> {
  // Only the bits the hook reads (`event.touches[0].clientX`, `clientY`).
  return { touches } as unknown as React.TouchEvent<HTMLElement>;
}

describe('usePullToRefresh — vertical-only commit', () => {
  beforeEach(() => {
    setScrollY(0);
  });
  afterEach(() => {
    setScrollY(0);
    vi.useRealTimers();
  });

  it('arms the gesture and reports pullDistance for a primarily-vertical downward drag', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 102, clientY: 150 }]));
    });

    expect(result.current.pullDistance).toBe(50);
  });

  it('ignores horizontal-dominant drags so a sideways swipe does NOT trigger the indicator', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    // 80px horizontal vs 5px vertical — clearly a horizontal swipe (e.g.
    // swipe-to-categorize on a transaction row). Must not commit pullDistance.
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 180, clientY: 105 }]));
    });

    expect(result.current.pullDistance).toBe(0);
  });

  it('does not arm when scrollY > 0 at touchStart (mid-page taps)', () => {
    const onRefresh = vi.fn();
    setScrollY(200);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 100, clientY: 200 }]));
    });

    expect(result.current.pullDistance).toBe(0);
  });

  it('caps the pullDistance at maxPullPx (resistance)', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, maxPullPx: 60 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 100, clientY: 500 }]));
    });

    expect(result.current.pullDistance).toBe(60);
  });
});

describe('usePullToRefresh — commit on touchEnd', () => {
  beforeEach(() => {
    setScrollY(0);
  });

  it('fires onRefresh when pullDistance crosses thresholdPx by touchEnd', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, thresholdPx: 40 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 100, clientY: 200 }]));
    });
    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    // touchEnd resets visual state to 0 so no indicator lingers.
    expect(result.current.pullDistance).toBe(0);
  });

  it('does NOT fire onRefresh when pullDistance is below thresholdPx', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh, thresholdPx: 80 }));

    act(() => {
      result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }]));
    });
    act(() => {
      result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 100, clientY: 130 }]));
    });
    act(() => {
      result.current.handlers.onTouchEnd();
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
