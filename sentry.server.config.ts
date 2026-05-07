/**
 * Sentry — Node.js (server) runtime config (PR-2).
 *
 * Loaded by `instrumentation.ts` when NEXT_RUNTIME === 'nodejs'.
 *
 * Activation: set `NEXT_PUBLIC_SENTRY_DSN` (browser-exposed) to enable
 * server-side capture. Without it, this file is a complete no-op — no
 * SDK init, no network requests, no console noise.
 *
 * Defaults are conservative on purpose:
 *   - tracesSampleRate: 0   — zero performance spans (preserves Sentry
 *                             Free tier 100K spans/mo quota; flip to a
 *                             small value like 0.05 once we have real
 *                             beta traffic to learn from).
 *   - integrations: []      — opt-in only; Sentry's auto-instrumented
 *                             integrations (HTTP, fs, etc.) add latency
 *                             on every request and aren't worth the
 *                             cost at this stage.
 *   - beforeSend: scrub PII — IBAN/JMBG/PAN/e-mail patterns scrubbed
 *                             via shared sentry-scrub.ts (mirrors
 *                             lib/logger.ts SE-6/SE-7 contract).
 */
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    integrations: [],
    environment: process.env.VERCEL_ENV ?? 'development',
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
