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
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
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
