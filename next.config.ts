import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
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
