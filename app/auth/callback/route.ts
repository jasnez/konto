import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Magic-link callback. Supabase appends `?code=...` (and sometimes `&next=...`)
 * to the URL configured as `emailRedirectTo` in `signInWithOtp`. We exchange
 * the code for a session (which sets auth cookies via the SSR helper) and
 * then redirect to the post-login target. On any failure, we bounce back to
 * /prijava with a flag the form uses to render a friendly notice.
 *
 * This is intentionally a Route Handler (not a Server Action) because the
 * magic-link email lands the user on an HTTP GET URL; it cannot be a form
 * submission.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = sanitizeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('auth_callback_error', { error: error.message });
  }

  return NextResponse.redirect(`${origin}/prijava?error=true`);
}

// Only allow relative, in-app paths. Prevents open-redirect via `?next=https://evil`.
function sanitizeNext(value: string | null): string {
  if (!value) return '/pocetna';
  if (!value.startsWith('/')) return '/pocetna';
  if (value.startsWith('//')) return '/pocetna';
  return value;
}
