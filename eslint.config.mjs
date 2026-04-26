import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextPlugin from '@next/eslint-plugin-next';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import noUnguardedMutation from './eslint-rules/no-unguarded-mutation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      '.claude/**',
      '.claire/**',
      'next-env.d.ts',
      '*.config.mjs',
      '*.config.ts',
      'components/ui/**',
      'supabase/types.ts',
      'scripts/**',
      'public/**',
      'eslint-rules/**',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  // SE-6: Ban raw console.* in Next.js app / lib server code.
  // lib/logger.ts itself suppresses with inline `// eslint-disable-next-line no-console`.
  // Client-side error boundaries (error.tsx) and Deno Edge Functions are re-permitted below.
  {
    files: ['app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts', 'lib/**/*.tsx'],
    rules: {
      'no-console': 'error',
    },
  },
  // SE-6: Re-permit console.* in client-side error boundaries only.
  // These are 'use client' components; console.error() fires in the browser and is
  // the standard way to report React error boundary activations to devtools / Sentry.
  {
    files: ['**/error.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
  // SE-6: Deno Edge Functions cannot import from '@/lib/logger' (different runtime).
  // console.* is the only logging mechanism available there; permit it explicitly.
  {
    files: ['supabase/functions/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // DL-8: Enforce .eq('user_id', ...) on every Supabase mutation against user-owned tables.
  // Applies to server-side code only (actions, API routes, server utilities, Edge functions).
  // To suppress for a legitimate cross-table ownership case:
  //   // eslint-disable-next-line local/no-unguarded-mutation -- ownership verified via <explain>
  {
    files: [
      'app/**/*.ts',
      'app/**/*.tsx',
      'lib/server/**/*.ts',
      'lib/**/*.ts',
      'supabase/functions/**/*.ts',
    ],
    plugins: {
      local: { rules: { 'no-unguarded-mutation': noUnguardedMutation } },
    },
    rules: {
      'local/no-unguarded-mutation': 'error',
    },
  },
  // Deno Edge functions: not part of the Next.js tsconfig (remote https imports).
  // Disable type-aware linting here so ESLint still runs syntax / non-type rules.
  {
    files: ['supabase/functions/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier,
);
