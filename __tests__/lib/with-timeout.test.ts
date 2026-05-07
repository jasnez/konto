import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from '@/lib/with-timeout';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the inner value when the promise wins the race', async () => {
    const inner = Promise.resolve('ok');
    await expect(withTimeout(inner, 1000, 'fast-query')).resolves.toBe('ok');
  });

  it('rejects with TimeoutError when the timer wins the race', async () => {
    // Inner promise that never resolves.
    const inner = new Promise<string>(() => {
      // never settles
    });
    const racing = withTimeout(inner, 500, 'slow-query');

    // Advance fake clock past the timeout.
    vi.advanceTimersByTime(500);

    await expect(racing).rejects.toBeInstanceOf(TimeoutError);
    await expect(racing).rejects.toMatchObject({
      label: 'slow-query',
      ms: 500,
      name: 'TimeoutError',
    });
  });

  it('rejects with the underlying error when the inner promise rejects first', async () => {
    const inner = Promise.reject(new Error('inner boom'));
    await expect(withTimeout(inner, 1000, 'rejecting-query')).rejects.toThrow('inner boom');
  });

  it('clears the timer when the inner promise resolves before timeout (no leak)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const inner = Promise.resolve(42);
    await withTimeout(inner, 5000, 'leak-test');
    // .finally() runs after Promise.race settles. clearTimeout should have
    // been called exactly once with the active timer handle.
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it('TimeoutError exposes label + ms for downstream Sentry tagging', () => {
    const err = new TimeoutError('forecast', 5000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err.name).toBe('TimeoutError');
    expect(err.label).toBe('forecast');
    expect(err.ms).toBe(5000);
    expect(err.message).toContain('forecast');
    expect(err.message).toContain('5000');
  });
});
