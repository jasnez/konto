/**
 * Real implementation of the E2E auth-bypass POST handler.
 *
 * This file is imported by app/api/test-auth/login/route.ts. In production
 * Vercel deployments (VERCEL_ENV=production), next.config.ts swaps this
 * import for auth-login-handler-stub.ts at build time via a webpack alias,
 * so this code is excluded from the production bundle entirely.
 *
 * Never import this file from application code — only from route.ts and tests.
 */
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

const REQUIRED_HEADER = 'x-e2e-auth';
const REQUIRED_HEADER_VALUE = 'konto-playwright';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return notFound();
  }
  if (process.env.VERCEL_ENV === 'production') {
    return notFound();
  }

  const expectedSecret = process.env.E2E_AUTH_BYPASS_SECRET;
  if (!expectedSecret || expectedSecret.length < 16) {
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
