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
    await assertGeminiKeyConfigured();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * S.4 (Supabase architecture audit 2026-05-08): surface a missing
 * GEMINI_API_KEY at server cold-start so a misconfigured Vercel deploy
 * fails loudly via Sentry rather than only when the first user tries to
 * import a PDF. Soft failure — does NOT crash the app, because users who
 * never touch the import flow should keep working. Sentry de-dupes
 * identical captureMessage calls so cold-start spam is bounded.
 */
async function assertGeminiKeyConfigured(): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!isProd || (geminiKey && geminiKey.length > 0)) return;

  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureMessage(
      'GEMINI_API_KEY is missing in production. PDF import + LLM categorization will fail when invoked. Set the env var in Vercel and redeploy.',
      'error',
    );
  } catch {
    // Sentry not configured — fall through; the parse route still throws
    // a clear "GEMINI_API_KEY nije konfigurisan" at first invocation.
  }
}

// Sentry SDK v10 renamed the helper from `onRequestError` to
// `captureRequestError`. Next 15 still expects an export named
// `onRequestError`, so we alias on re-export.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
