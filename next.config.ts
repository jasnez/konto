import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
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
