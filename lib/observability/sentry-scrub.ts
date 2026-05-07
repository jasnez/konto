/**
 * PII scrubbing for Sentry event payloads (PR-2).
 *
 * Sentry's `beforeSend` hook receives the event right before it's
 * shipped to the Sentry servers. We walk every string field and apply
 * the same redaction patterns enforced for server-side logs in
 * `lib/logger.ts` (SE-6 / SE-7) so PII never leaves the user's box —
 * even when an exception's message or breadcrumb body contains an
 * IBAN, JMBG, payment card number, or e-mail address.
 *
 * Patterns are intentionally duplicated from `lib/logger.ts` rather
 * than imported because:
 *   1. Sentry SDK runs in three runtimes (Node / Edge / Browser); each
 *      has its own bundling boundary, so a shared import bloats the
 *      Edge bundle with logger.ts's deps.
 *   2. The redaction contract is a security invariant — we WANT it
 *      visible in two places so any change to one alerts a reviewer
 *      to also update the other.
 *
 * If a future PR unifies them, extract this list into a tiny
 * dependency-free `lib/redact-patterns.ts` and import from both.
 */

const REDACT_PATTERNS: RegExp[] = [
  // IBAN: ISO 13616 — 2 letters + 2 digits + 1–30 alphanumeric
  /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
  // JMBG / UMCN: exactly 13 consecutive digits
  /\b\d{13}\b/g,
  // Payment card PAN: 13–19 digits with optional space/hyphen separators
  /\b(?:\d[ -]?){13,18}\d\b/g,
  // E-mail address
  /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g,
];

const REDACTED = '[REDACTED]';

function redactString(value: string): string {
  let s = value;
  for (const re of REDACT_PATTERNS) {
    re.lastIndex = 0;
    s = s.replace(re, REDACTED);
  }
  return s;
}

/**
 * Recursively walk a Sentry event and redact every string field. Stops
 * at primitives (number, boolean, null, undefined) and at depth 8 so a
 * cyclic reference can't pin the event loop.
 *
 * Returns the same `event` object (mutated). Sentry's `beforeSend`
 * contract permits in-place mutation.
 */
export function scrubSentryEvent<T>(event: T, depth = 0): T {
  if (depth > 8) return event;
  if (event === null || event === undefined) return event;
  if (typeof event === 'string') {
    return redactString(event) as T;
  }
  if (typeof event !== 'object') return event;
  if (Array.isArray(event)) {
    for (let i = 0; i < event.length; i += 1) {
      event[i] = scrubSentryEvent(event[i] as unknown, depth + 1);
    }
    return event;
  }
  for (const key of Object.keys(event)) {
    const obj = event as Record<string, unknown>;
    obj[key] = scrubSentryEvent(obj[key], depth + 1);
  }
  return event;
}
