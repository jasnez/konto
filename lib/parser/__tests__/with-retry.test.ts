// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
} from '@google/generative-ai';
import { withRetry } from '../with-retry';

// Replace real timers so the 1s/2s sleep() calls inside withRetry resolve
// instantly, keeping the test suite fast.
beforeAll(() => vi.useFakeTimers());
afterAll(() => vi.useRealTimers());
afterEach(() => vi.clearAllTimers());

/** Runs withRetry(fn) and advances fake time until the promise settles. */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  const promise = withRetry(fn);
  // Attach a no-op catch so Node.js does not fire "unhandledRejection" for
  // immediately-failing cases while vi.runAllTimersAsync() is in flight.
  // The real rejection propagates when the caller awaits the return value.
  promise.catch(() => {
    /* handled below */
  });
  await vi.runAllTimersAsync();
  return promise;
}

describe('withRetry — success path', () => {
  it('returns result of a successful first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await run(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — retryable errors', () => {
  it('retries on 503 and succeeds on second attempt', async () => {
    const err = new GoogleGenerativeAIFetchError('503', 503, 'Service Unavailable');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');
    expect(await run(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds on third attempt', async () => {
    const err = new GoogleGenerativeAIFetchError('500', 500, 'Internal Server Error');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');
    expect(await run(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 quota error', async () => {
    const err = new GoogleGenerativeAIFetchError('429', 429, 'Too Many Requests');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');
    expect(await run(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on GoogleGenerativeAIAbortError (timeout)', async () => {
    const err = new GoogleGenerativeAIAbortError('timeout');
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('recovered');
    expect(await run(fn)).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts all 3 attempts and rethrows the last error on persistent 503', async () => {
    const err = new GoogleGenerativeAIFetchError('503', 503, 'Service Unavailable');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(run(fn)).rejects.toThrow('503');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry — non-retryable errors', () => {
  it('does not retry on 400 Bad Request — rethrows immediately', async () => {
    const err = new GoogleGenerativeAIFetchError('400', 400, 'Bad Request');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(run(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401 Unauthorized', async () => {
    const err = new GoogleGenerativeAIFetchError('401', 401, 'Unauthorized');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(run(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on GoogleGenerativeAIRequestInputError', async () => {
    const err = new GoogleGenerativeAIRequestInputError('malformed schema');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(run(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
