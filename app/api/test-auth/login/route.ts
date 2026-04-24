import { timingSafeEqual } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { mustExist } from '@/lib/env';
import type { Database } from '@/supabase/types';

const LoginSchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(10),
  secret: z.string().min(8),
});

// Required client header. A same-origin browser cannot forge this for a
// cross-origin attacker because simple-request headers are limited, and any
// request with a custom header triggers a CORS preflight. This is a defense
// layer on top of NODE_ENV / VERCEL_ENV and the shared secret.
const REQUIRED_HEADER = 'x-e2e-auth';
const REQUIRED_HEADER_VALUE = 'konto-playwright';

/**
 * E2E-only login bridge. Locked down in four layers:
 *   1. NODE_ENV !== 'production'
 *   2. VERCEL_ENV !== 'production' (prevents NODE_ENV misconfig on a preview)
 *   3. Shared secret MUST be set via env — no fallback. Missing env => 404.
 *   4. A required client header that simple cross-origin requests cannot send.
 * Secrets are compared in constant time.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return notFound();
  }
  // Vercel sets VERCEL_ENV to 'production' | 'preview' | 'development' on
  // deployments. We only allow this endpoint on preview/development and for
  // unset (local dev).
  if (process.env.VERCEL_ENV === 'production') {
    return notFound();
  }

  const expectedSecret = process.env.E2E_AUTH_BYPASS_SECRET;
  if (!expectedSecret || expectedSecret.length < 16) {
    // No secret configured => endpoint is disabled. Do not fall back to a
    // hard-coded string, which would make this route reachable on any deploy
    // that accidentally leaks NODE_ENV=development.
    return notFound();
  }

  if (request.headers.get(REQUIRED_HEADER) !== REQUIRED_HEADER_VALUE) {
    return notFound();
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  if (!secretsEqual(parsed.data.secret, expectedSecret)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const supabase = createServerClient<Database>(
    mustExist('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    mustExist('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.setSession({
    access_token: parsed.data.accessToken,
    refresh_token: parsed.data.refreshToken,
  });
  if (error) {
    return NextResponse.json({ error: 'AUTH_FAILED', message: error.message }, { status: 401 });
  }

  return response;
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
}

function secretsEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
