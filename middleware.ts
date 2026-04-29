import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets chunks loaded by the nonced bootstrap inherit trust.
    // 'self' stays as fallback for browsers that don't support 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.frankfurter.app",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  // Generate a fresh nonce for every request. Next.js App Router reads
  // x-nonce from the forwarded request headers and applies it to all its
  // inline hydration <script> tags automatically (since Next 13.4).
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = await updateSession(request, requestHeaders);

  response.headers.set('Content-Security-Policy', buildCsp(nonce));

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
};
