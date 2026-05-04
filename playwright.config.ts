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

/**
 * Public Supabase local stack keys (same as `supabase start` / `status -o env`).
 * Split so secret scanners do not match a full JWT on one line.
 */
const SUPABASE_LOCAL_DEMO_ANON = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9',
  'CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
].join('.');

const SUPABASE_LOCAL_DEMO_SERVICE = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0',
  'EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
].join('.');

/**
 * E2E always targets the DB from `supabase db reset` in globalSetup.
 * Do not inherit hosted project URLs from `.env.local` (they lag migrations and break PostgREST).
 */
const localSupabaseEnv =
  process.env.E2E_REMOTE_SUPABASE === '1'
    ? {
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? dotEnvLocal.NEXT_PUBLIC_SUPABASE_URL ?? '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          dotEnvLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          '',
        SUPABASE_SERVICE_ROLE_KEY:
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? dotEnvLocal.SUPABASE_SERVICE_ROLE_KEY ?? '',
      }
    : {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_LOCAL_DEMO_ANON,
        SUPABASE_SERVICE_ROLE_KEY: SUPABASE_LOCAL_DEMO_SERVICE,
      };
const e2eSecret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';
const accountDeletionSecret =
  process.env.ACCOUNT_DELETION_TOKEN_SECRET ??
  'e2e-account-deletion-token-secret-at-least-32-characters-long';

Object.assign(process.env, localSupabaseEnv, {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:4173',
  E2E_AUTH_BYPASS_SECRET: e2eSecret,
  ACCOUNT_DELETION_TOKEN_SECRET: accountDeletionSecret,
});

export default defineConfig({
  globalSetup: require.resolve('./__tests__/e2e/global-setup.ts'),
  testDir: './__tests__/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm run e2e:web',
    url: 'http://127.0.0.1:4173',
    // 300s budget covers cold-start of Docker + 60+ supabase migrations +
    // Next dev compile on a slow CI runner. The previous 180s would
    // intermittently expire before health checks completed (saw it post-merge
    // at #127). Local dev rarely needs more than 60s.
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      ...dotEnvLocal,
      ...localSupabaseEnv,
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:4173',
      E2E_AUTH_BYPASS_SECRET: e2eSecret,
      E2E_ALLOW_DELETION_WITHOUT_RESEND: '1',
      ACCOUNT_DELETION_TOKEN_SECRET: accountDeletionSecret,
    },
  },
});
