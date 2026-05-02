import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // SE-4: Static security headers. CSP is nonce-based and therefore
  // generated per-request in middleware.ts (nonce must change each request).
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
