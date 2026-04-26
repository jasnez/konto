/**
 * Exponential-backoff retry wrapper for Gemini API calls.
 *
 * Retries on transient server-side and network failures; does NOT retry
 * on client errors (bad input, auth failures) or quota exhaustion with
 * very short windows — those are surfaced immediately to the caller.
 */
import {
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIRequestInputError,
} from '@google/generative-ai';

/** Delays (ms) between successive attempts.  Length = max attempts − 1. */
const RETRY_DELAYS_MS = [1_000, 2_000]; // 3 total attempts: immediate, +1s, +2s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns `true` for errors that warrant a retry:
 *   - 429 Too Many Requests (quota window resets quickly on the free tier)
 *   - 5xx Service Unavailable / Internal Server Error
 *   - Timeout / abort (GoogleGenerativeAIAbortError)
 *   - Network-layer errors (ECONNRESET, ETIMEDOUT, …)
 *
 * Returns `false` for permanent client errors that will not improve on retry:
 *   - 4xx (except 429)
 *   - GoogleGenerativeAIRequestInputError (malformed prompt / schema)
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof GoogleGenerativeAIRequestInputError) return false;
  if (err instanceof GoogleGenerativeAIAbortError) return true; // timeout
  if (err instanceof GoogleGenerativeAIFetchError) {
    const { status } = err;
    return status !== undefined && (status === 429 || status >= 500);
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes('econnreset') ||
      m.includes('econnrefused') ||
      m.includes('etimedout') ||
      m.includes('network') ||
      m.includes('fetch failed')
    );
  }
  return false;
}

/**
 * Runs `fn` up to `RETRY_DELAYS_MS.length + 1` times.
 *
 * Between attempts waits `RETRY_DELAYS_MS[attempt − 1]` ms.  Non-retryable
 * errors are re-thrown immediately without consuming remaining attempts.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      // Retryable + more attempts remain — loop continues.
    }
  }

  // Unreachable, but TypeScript needs this.
  throw lastErr;
}
