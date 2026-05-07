/**
 * Timeout wrapper for promises (AV-9).
 *
 * Races the supplied promise against a timer; if the timer wins, rejects
 * with `TimeoutError`. Used on `/pocetna` to bound how long any single
 * dashboard query can keep its Suspense boundary in skeleton state — a
 * hung query no longer leaves the whole widget spinning forever.
 *
 * Caveat: `Promise.race` does NOT cancel the loser. The underlying query
 * keeps running on the server until it completes or the request is
 * GC'd. That's acceptable for short-lived per-request work in the
 * Vercel Lambda runtime; for repeated background work you'd want a
 * proper `AbortController` instead.
 */

export class TimeoutError extends Error {
  readonly label: string;
  readonly ms: number;

  constructor(label: string, ms: number) {
    super(`Timed out after ${String(ms)}ms: ${label}`);
    this.name = 'TimeoutError';
    this.label = label;
    this.ms = ms;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
