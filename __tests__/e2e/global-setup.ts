import { execSync } from 'node:child_process';

/**
 * Ensures local Supabase matches repo migrations before the dev server and tests run.
 * Order: Playwright loads config (env), runs this globalSetup, then starts webServer.
 */
export default async function globalSetup(): Promise<void> {
  execSync('pnpm exec supabase start', { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  // `supabase start` already applies migrations + seed when booting the stack.
  // Locally we still run `db reset` so stale volumes from previous dev sessions
  // can't pollute test state. CI runners are ephemeral (no cached volumes), so
  // the reset is redundant there — and it triggers a container restart that
  // intermittently returns HTTP 502 (PostgREST/GoTrue briefly unavailable),
  // causing flaky CI failures. Same pattern as the RLS job in ci.yml.
  if (process.env.CI !== 'true') {
    execSync('pnpm exec supabase db reset --yes', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
  }
  // PostgREST can briefly lag behind migrations; avoids flaky PGRST204 on new columns.
  await new Promise((r) => setTimeout(r, 8000));
}
