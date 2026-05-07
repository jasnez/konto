/**
 * Sentry — Edge runtime config (PR-2).
 *
 * Loaded by `instrumentation.ts` when NEXT_RUNTIME === 'edge'. Covers
 * `middleware.ts` and any future Edge functions.
 *
 * Same conservative defaults as `sentry.server.config.ts`. The Edge
 * runtime has tighter cold-start and memory budgets, so keeping
 * `integrations: []` matters more here than in Node.
 *
 * Activation: set `NEXT_PUBLIC_SENTRY_DSN`. No-op without it.
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
