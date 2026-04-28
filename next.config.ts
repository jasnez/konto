import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // SE-4: Security hardening headers.
  // CSP rolled back to report-only on 2026-04-28 because the enforce flip
  // (PR #18) blanked the production app — at least one critical inline
  // script (Next.js hydration / Sentry / Vercel Analytics) is not yet
  // covered by the directive set. Re-enable enforce only after auditing
  // browser console violations during a full user flow and adjusting the
  // directives (likely needs nonce-based script-src or 'unsafe-inline'
  // on a narrowed set).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Report-only CSP. Violations are logged to the browser console
          // (and reported if a report-uri is added later) but not enforced.
          // Do NOT flip back to 'Content-Security-Policy' until the
          // directive set is verified against an actual full user flow:
          // login → dashboard → transactions → import → categories →
          // accounts → security settings → insights, with DevTools open.
          // The previous flip (PR #18) blanked the app, so the policy is
          // currently known to be too strict for real traffic.
          {
            key: 'Content-Security-Policy-Report-Only',
            value:
              "default-src 'self'; " +
              "script-src 'self'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.frankfurter.app; " +
              "frame-ancestors 'none'; " +
              "base-uri 'self'; " +
              "form-action 'self'",
          },
        ],
      },
    ];
  },
  // pdfjs-dist uses require.resolve() at module initialisation to locate its
  // worker file. Bundling it (webpack/turbopack) changes the file-system
  // layout and makes require.resolve() fail at runtime on Vercel → 500.
  // Marking it as external tells Next.js to leave it in node_modules and
  // let Node.js resolve it natively, which is the only supported pattern.
  serverExternalPackages: ['pdfjs-dist', 'canvas'],
  // pdf.worker.mjs is loaded by pdfjs-dist as a dynamic import at runtime.
  // Next.js's output-file tracer does not follow dynamic imports, so the
  // worker file is absent from the Vercel serverless bundle by default.
  // outputFileTracingIncludes forces it into every route that needs it.
  outputFileTracingIncludes: {
    '/api/imports/[batchId]/parse': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/inngest': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  turbopack: {
    root: __dirname,
  },
  // In production Vercel deployments, swap the real E2E auth-bypass handler
  // for a 404 stub so the auth-bypass code never enters the production bundle.
  // VERCEL_ENV is 'production' only on Vercel production deployments; it is
  // unset in local dev/CI, which is where E2E tests run against the endpoint.
  webpack(config) {
    if (process.env.VERCEL_ENV === 'production') {
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'lib/e2e/auth-login-handler')]: path.resolve(
          __dirname,
          'lib/e2e/auth-login-handler-stub.ts',
        ),
      };
    }
    return config;
  },
  // We rely on `pnpm build` / Vercel build-step ESLint as the last gate before
  // production because we don't run separate CI on PRs. The pre-commit hook
  // only lints staged files, so a `--no-verify` bypass or a missed file would
  // otherwise reach prod silently.
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
