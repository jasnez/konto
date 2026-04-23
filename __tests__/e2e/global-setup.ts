import { execSync } from 'node:child_process';

/**
 * Ensures local Supabase matches repo migrations before the dev server and tests run.
 * Order: Playwright loads config (env), runs this globalSetup, then starts webServer.
 */
export default async function globalSetup(): Promise<void> {
  execSync('pnpm exec supabase start', { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  execSync('pnpm exec supabase db reset --yes', {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  // PostgREST can briefly lag behind migrations; avoids flaky PGRST204 on new columns.
  await new Promise((r) => setTimeout(r, 8000));
}
