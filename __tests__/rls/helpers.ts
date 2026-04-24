/**
 * Shared scaffolding for RLS integration tests.
 *
 * Each RLS spec wires up two authenticated users (A, B) and one
 * service-role admin client. The boilerplate is non-trivial and
 * identical across specs — this module centralizes it so each spec
 * just declares two `setupUser` calls and gets back ready-to-use
 * clients. See `transactions.test.ts` for the original inline form.
 *
 * Run these tests against a local Supabase stack with
 * `RUN_INTEGRATION_TESTS=1` — see `transactions.test.ts` for the env
 * vars needed.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

export const SHOULD_RUN = process.env.RUN_INTEGRATION_TESTS === '1';

export const SUPABASE_URL = process.env.SUPABASE_URL_TEST ?? '';
export const ANON_KEY = process.env.SUPABASE_ANON_KEY_TEST ?? '';
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_TEST ?? '';

export const TEST_PASSWORD = 'qa-test-password-12345';

export function assertEnv(): void {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error(
      'Integration test requires SUPABASE_URL_TEST, SUPABASE_ANON_KEY_TEST, SUPABASE_SERVICE_KEY_TEST.',
    );
  }
}

export function uniqueEmail(tag: string): string {
  return `qa-${tag}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@konto.local`;
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createUser(
  admin: SupabaseClient<Database>,
  tag: string,
): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(tag);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, email: data.user.email ?? email };
}

export async function signedInClient(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw error;
  return client;
}
