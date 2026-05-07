/**
 * Sentry — Browser runtime config (PR-2).
 *
 * Auto-loaded by `withSentryConfig` for the client bundle.
 *
 * Defaults — same conservative posture as server / edge:
 *   - tracesSampleRate: 0   — zero browser perf spans (Sentry Web
 *                             Vitals can be re-enabled later via
 *                             tracesSampleRate >0; not worth the bundle
 *                             cost at the 5-user beta stage).
 *   - replaysSessionSampleRate: 0
 *   - replaysOnErrorSampleRate: 0  — no Session Replay. Privacy
 *                                    (records DOM incl. form inputs)
 *                                    + 200 KB bundle cost + Free-tier
 *                                    quota all argue against shipping
 *                                    it before we have a specific
 *                                    incident class that needs it.
 *   - integrations: []      — opt-in only.
 *   - beforeSend: scrub PII — IBAN/JMBG/PAN/e-mail patterns scrubbed.
 *
 * Activation: set `NEXT_PUBLIC_SENTRY_DSN`. No-op without it (no
 * console warning, no network requests, no overhead).
 */
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/sentry-scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [],
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
