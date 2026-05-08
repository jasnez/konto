import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { mustExist } from '@/lib/env';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

// Every directory under app/(app)/ that requires an authenticated user MUST
// be listed here. Pages handle their own getUser() + redirect('/prijava')
// at render time as defense-in-depth, but middleware is the first gate —
// without an entry here, an unauthenticated request reaches the page (or
// the route group's not-found) instead of bouncing to /prijava early. SE-9
// regression: __tests__/lib/supabase/protected-paths.test.ts asserts that
// every app/(app)/X directory either appears here or is on the explicit
// PUBLIC_CONTENT_PAGES allow-list.
//
// DO NOT add a route that doesn't exist as a real directory — Next's 404
// would then render inside the authed shell after a /prijava bounce, which
// is worse UX than a plain 404.
export const PROTECTED_PATHS = [
  '/pocetna',
  '/transakcije',
  '/racuni',
  '/uvidi',
  '/podesavanja',
  '/kategorije',
  '/merchants',
  // Phase 3 routes (added by SE-9):
  '/budzeti',
  '/ciljevi',
  '/import',
  '/kartice-rate',
  '/potrosnja',
  '/pretplate',
  '/skeniraj',
];

export async function updateSession(request: NextRequest, extraRequestHeaders?: Headers) {
  const requestHeaders = extraRequestHeaders ?? request.headers;
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    mustExist('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    mustExist('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // Any call on `supabase` before getUser() breaks session refresh silently.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('deleted_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      // S.5 (audit 2026-05-08): the lenient fall-through here is intentional
      // — a transient DB blip should not log every authed user out. But the
      // event needs explicit visibility: page-level getUser() will re-check,
      // and the user keeps moving, so the only signal that middleware fell
      // back is this breadcrumb + Sentry message. logSafe alone goes to
      // console, which the Edge runtime Sentry config (integrations: []) does
      // not auto-capture.
      logSafe('middleware_profile_deleted_check_error', { error: profileError.message });
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureMessage(
          `middleware_profile_deleted_check_error: ${profileError.message}`,
          'warning',
        );
      } catch {
        // Sentry not configured — logSafe already logged; nothing more to do.
      }
    } else if (profile?.deleted_at) {
      const path = request.nextUrl.pathname;
      const allowedWhenDeleted =
        path.startsWith('/obrisan') ||
        path.startsWith('/auth/otkazi-brisanje') ||
        path.startsWith('/auth/callback');
      if (!allowedWhenDeleted) {
        const url = request.nextUrl.clone();
        url.pathname = '/obrisan';
        return NextResponse.redirect(url);
      }
    }
  }

  const isProtected = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/prijava';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
