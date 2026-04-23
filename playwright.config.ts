import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnv(filename: string): Record<string, string> {
  const path = join(process.cwd(), filename);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1');
  }
  return out;
}

const dotEnvLocal = loadDotEnv('.env.local');
const localSupabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? dotEnvLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? dotEnvLocal.SUPABASE_SERVICE_ROLE_KEY ?? '',
};
const e2eSecret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';

Object.assign(process.env, localSupabaseEnv, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4173',
  E2E_AUTH_BYPASS_SECRET: e2eSecret,
});

export default defineConfig({
  testDir: './__tests__/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm exec next dev --turbopack --port 4173',
    url: 'http://localhost:4173',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      ...dotEnvLocal,
      ...localSupabaseEnv,
      NEXT_PUBLIC_SITE_URL: 'http://localhost:4173',
      E2E_AUTH_BYPASS_SECRET: e2eSecret,
    },
  },
});
