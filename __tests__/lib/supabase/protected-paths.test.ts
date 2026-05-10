/**
 * SE-9 drift detector for `lib/supabase/middleware.PROTECTED_PATHS`.
 *
 * The bug class: someone adds `app/(app)/foo/page.tsx` (a new protected
 * page) and forgets to add `/foo` to `PROTECTED_PATHS`. Result —
 * unauthenticated requests reach the page layer instead of being bounced
 * by middleware. The page's own `getUser() + redirect('/prijava')` call
 * still saves us today, but it's defense-in-depth: if anyone ever forgets
 * the page-level check OR uses the buggy `if (!user) return null` pattern
 * (as `/kartice-rate` did pre-SE-9), there is zero net.
 *
 * This test enumerates every directory under `app/(app)/` at test time
 * and asserts each one is either:
 *   1. Listed in `PROTECTED_PATHS` (the canonical case for protected pages), OR
 *   2. Listed in `PUBLIC_CONTENT_PAGES` below (the explicit allow-list for
 *      intentionally-public marketing/disclosure content that lives under
 *      `app/(app)/` for layout-sharing).
 *
 * If a future PR adds a new protected segment, this test fails until
 * the dev makes a conscious choice between the two lists. That review
 * gate is the whole point — eliminates the SE-9 bug class.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTECTED_PATHS } from '@/lib/supabase/middleware';

/**
 * Top-level directories under `app/(app)/` that are intentionally public —
 * they share the authed layout for visual consistency but render the same
 * content for logged-in and logged-out visitors. Each one's `page.tsx`
 * intentionally has no `getUser() + redirect('/prijava')` guard.
 *
 * Adding a new entry here is a conscious decision that the page contains
 * NO authenticated data and is safe to expose without a session.
 */
const PUBLIC_CONTENT_PAGES = new Set<string>([
  // UX-10: was 'help' before route renamed to /pomoc.
  'pomoc', // FAQ — public marketing content
  'vodic', // user guide — public marketing content
  'sigurnost', // security/privacy disclosure — also short-circuited via middleware.PUBLIC_PAGE_PATHS
]);

describe('PROTECTED_PATHS — SE-9 drift detector', () => {
  it('covers every protected app/(app)/ segment', async () => {
    const appDir = join(process.cwd(), 'app', '(app)');
    const entries = await readdir(appDir, { withFileTypes: true });
    const segments = entries
      // Filter out parallel routes (@modal etc.), catch-all segments
      // ([...notFound]), and non-directory entries (layout.tsx, error.tsx,
      // not-found.tsx, …). Only real top-level route segments count.
      .filter((e) => e.isDirectory() && !e.name.startsWith('@') && !e.name.startsWith('['))
      .map((e) => e.name);

    const missing: string[] = [];
    const unexpectedPublic: string[] = [];

    for (const seg of segments) {
      const path = `/${seg}`;
      const isProtected = PROTECTED_PATHS.includes(path);
      const isPublic = PUBLIC_CONTENT_PAGES.has(seg);

      if (!isProtected && !isPublic) {
        missing.push(path);
      }
      if (isProtected && isPublic) {
        unexpectedPublic.push(path);
      }
    }

    // Assertions are stated as plain arrays (not toContain loops) so the
    // failure message lists every missing path in one shot — easier to
    // act on in a code review.
    expect(missing, 'protected segments missing from PROTECTED_PATHS').toEqual([]);
    expect(
      unexpectedPublic,
      'segments listed in BOTH PROTECTED_PATHS and PUBLIC_CONTENT_PAGES',
    ).toEqual([]);
  });

  it('does not list paths that have no matching app/(app)/ directory', async () => {
    const appDir = join(process.cwd(), 'app', '(app)');
    const entries = await readdir(appDir, { withFileTypes: true });
    const segments = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));

    const stale = PROTECTED_PATHS.filter((p) => {
      const seg = p.replace(/^\//u, '');
      return !segments.has(seg);
    });

    expect(stale, 'PROTECTED_PATHS entries with no matching app/(app)/ directory').toEqual([]);
  });
});
