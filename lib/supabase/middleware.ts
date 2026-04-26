import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { mustExist } from '@/lib/env';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

// Keep this list aligned with directories under app/(app)/. Adding an entry
// for a route that doesn't exist causes Next's 404 to render inside the authed
// shell (and an unauthenticated bounce to /prijava before the 404), which is
// worse UX than a plain 404.
const PROTECTED_PATHS = [
  '/pocetna',
  '/transakcije',
  '/racuni',
  '/uvidi',
  '/podesavanja',
  '/kategorije',
  '/merchants',
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
      logSafe('middleware_profile_deleted_check_error', { error: profileError.message });
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
