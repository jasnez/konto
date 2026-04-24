/**
 * Sanitize the `?next=` parameter used by the magic-link callback before
 * passing it to `NextResponse.redirect`.
 *
 * Threat model:
 *   1. Open redirect via external URL:              `?next=https://evil.com`
 *   2. Open redirect via protocol-relative URL:     `?next=//evil.com`
 *   3. Backslash normalization bypass (some UAs):   `?next=/\evil.com`
 *   4. Mixed slash/backslash:                       `?next=/\/evil.com`
 *   5. Control-char / header-splitting:             `?next=/%0D%0Aevil`
 *   6. `javascript:` / `data:` URIs via raw or encoded colon
 *   7. Whitespace smuggling:                        `?next= /evil`
 *
 * Any input that fails validation collapses to the safe default `/pocetna`.
 */
export const DEFAULT_SAFE_NEXT = '/pocetna';

export function sanitizeNextPath(value: string | null | undefined): string {
  if (typeof value !== 'string') return DEFAULT_SAFE_NEXT;
  if (value.length === 0 || value.length > 512) return DEFAULT_SAFE_NEXT;

  // Reject any control chars (including CR/LF/NUL/TAB) — header splitting &
  // some browsers' URL normalizers treat \t/\n as separators.
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_SAFE_NEXT;

  // Must be a strictly-local path.
  if (!value.startsWith('/')) return DEFAULT_SAFE_NEXT;

  // Block all forms of network-path references. Browsers treat `//host` and
  // — in some legacy cases — `/\host` as protocol-relative authority.
  if (value[1] === '/' || value[1] === '\\') return DEFAULT_SAFE_NEXT;

  // Belt-and-braces against backslash anywhere in the path. There is no
  // legitimate in-app route with a backslash, and Windows-style separators
  // can be normalized by some proxies into `//`.
  if (value.includes('\\')) return DEFAULT_SAFE_NEXT;

  return value;
}
