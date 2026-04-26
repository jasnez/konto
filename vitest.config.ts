import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/__tests__/e2e/**',
      '**/.claude/**',
      '**/.claire/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/node_modules/**', '**/types.ts'],
      thresholds: {
        'lib/fx/**': {
          statements: 95,
          branches: 95,
          functions: 100,
          lines: 95,
        },
        'lib/parser/**': {
          statements: 85,
          branches: 75,
          functions: 85,
          lines: 85,
        },
        'app/**/actions.ts': {
          statements: 33,
          branches: 25,
          functions: 48,
          lines: 35,
        },
        lines: 32,
        statements: 32,
        functions: 24,
        branches: 27,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
