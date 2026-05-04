import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Public marketing/disclosure pages: no Supabase auth needed. Skipping
// updateSession() saves two Supabase round-trips per request, which is the
// dominant cost when bots/SEO crawlers hit public content. CSP nonce is
// still set so inline hydration scripts continue to work.
const PUBLIC_PAGE_PATHS = new Set(['/', '/privatnost', '/uslovi', '/kontakt', '/sigurnost']);

function buildCsp(nonce: string): string {
  // Include the explicit Supabase URL so the browser-side Supabase client
  // (HashSessionHandler's setSession call) is allowed in every environment.
  // In production this resolves to https://[proj].supabase.co; in local dev
  // and CI E2E it resolves to http://127.0.0.1:54321 — not covered by the
  // *.supabase.co wildcard, so it must be explicit.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseWsUrl = supabaseUrl.replace(/^https:/u, 'wss:').replace(/^http:/u, 'ws:');
  const supabaseSrcs = supabaseUrl ? `${supabaseUrl} ${supabaseWsUrl} ` : '';

  return [
    "default-src 'self'",
    // 'strict-dynamic' lets chunks loaded by the nonced bootstrap inherit trust.
    // 'self' stays as fallback for browsers that don't support 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseSrcs}https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.frankfurter.app`,
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

  // Public marketing/disclosure paths: skip Supabase session refresh.
  // Saves two Supabase round-trips per request — the dominant middleware
  // cost when bots/SEO crawlers hit public pages. CSP nonce is still set
  // so inline hydration scripts continue to work.
  if (PUBLIC_PAGE_PATHS.has(request.nextUrl.pathname)) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
    return response;
  }

  const response = await updateSession(request, requestHeaders);

  response.headers.set('Content-Security-Policy', buildCsp(nonce));

  return response;
}

export const config = {
  // Matcher excludes static-like paths (no HTML, no JS, no auth) so they
  // never count as middleware invocations. Anything else flows through
  // middleware so CSP nonce + (when needed) Supabase session refresh can run.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|manifest.webmanifest|sw.js|offline.html|icons|.well-known|sitemap.xml|robots.txt).*)',
  ],
};
