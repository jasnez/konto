/**
 * Safe structured logger for all server-side code.
 *
 * Every string value in `fields` is scrubbed for known PII patterns
 * (IBAN, JMBG/UMCN, payment card PANs, e-mail addresses) before the
 * record reaches console — and therefore Vercel log drains or any
 * future error-tracking service.  This is the *only* file in the repo
 * that is allowed to call `console` directly; everywhere else must use
 * `logSafe` / `logWarn`.
 *
 * Usage:
 *   import { logSafe, logWarn } from '@/lib/logger';
 *   logSafe('create_account_error', { userId: user.id, error: err.message });
 *   logWarn('fx_fallback', { currency: 'SEK', rate: '1:1' });
 */

/**
 * Patterns applied to every **string** value in the fields object.
 * Intentionally broad: a false-positive emits `[REDACTED]`; a false-
 * negative leaks PII — we prefer the former.
 */
const REDACT_PATTERNS: RegExp[] = [
  // IBAN: ISO 13616 — 2 letters + 2 digits + 1–30 alphanumeric
  /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
  // JMBG / UMCN: exactly 13 consecutive digits
  /\b\d{13}\b/g,
  // Payment card PAN: 13–19 digits (Visa 13/16, MC 16, AMEX 15, etc.)
  // Spaces and hyphens as separators are included in the match.
  /\b(?:\d[ -]?){13,18}\d\b/g,
  // E-mail address
  /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g,
];

function redactString(value: string): string {
  let s = value;
  for (const re of REDACT_PATTERNS) {
    re.lastIndex = 0; // reset global flag state between calls
    s = s.replace(re, '[REDACTED]');
  }
  return s;
}

function scrub(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = typeof value === 'string' ? redactString(value) : value;
  }
  return out;
}

/**
 * Structured error log.
 *
 * Vercel captures `console.error(label, object)` as a structured log
 * entry in Log Drains / the dashboard with the label as the message and
 * the object as metadata.
 */
export function logSafe(event: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.error(event, scrub(fields));
}

/**
 * Structured warning log.  Use for non-fatal degraded-mode conditions
 * (e.g. FX fallback to 1:1, storage cleanup skipped, stale rate used).
 */
export function logWarn(event: string, fields: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  console.warn(event, scrub(fields));
}
