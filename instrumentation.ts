/**
 * Next.js 15 instrumentation hook (PR-2 / Sentry).
 *
 * Called once per server-side runtime cold-start. Selects which Sentry
 * config to load based on `NEXT_RUNTIME` ('nodejs' for Node functions,
 * 'edge' for Edge functions / middleware). The browser config is
 * auto-loaded by `withSentryConfig` — not here.
 *
 * `onRequestError` is the Next 15 hook for capturing errors that
 * escape Server Components, Server Actions, and route handlers; it
 * forwards them to whichever Sentry runtime is active. Re-export from
 * @sentry/nextjs is the canonical wiring (per Sentry docs for Next 15).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Sentry SDK v10 renamed the helper from `onRequestError` to
// `captureRequestError`. Next 15 still expects an export named
// `onRequestError`, so we alias on re-export.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
