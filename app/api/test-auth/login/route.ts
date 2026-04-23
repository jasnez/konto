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

/**
 * E2E-only login bridge:
 * - disabled in production
 * - protected by shared secret
 * - signs in with password and sets SSR auth cookies in the response
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const expectedSecret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';
  if (parsed.data.secret !== expectedSecret) {
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
