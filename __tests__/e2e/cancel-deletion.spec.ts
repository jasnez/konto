/**
 * MT-4: cancel-deletion E2E test.
 *
 * Verifies that the cancel-deletion route clears `profile.deleted_at` when
 * presented with a valid, unused token, and responds with a redirect to the
 * magic-link URL (not to the error page).
 *
 * The test generates the cancel token programmatically (same algorithm as
 * `signAccountDeletionCancelToken`) to avoid dependence on email delivery.
 * It hits the HTTP route directly via `page.request.get` so it does not need
 * to follow the full Supabase magic-link redirect chain.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  cleanupTestUser,
  mustEnv,
  setProfileDeletedAt,
  signInAsTestUser,
} from './helpers';

function generateCancelToken(userId: string, secret: string, exp: number): string {
  const payload = { sub: userId, exp, jti: randomUUID() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  return `${payloadB64}.${Buffer.from(sig).toString('base64url')}`;
}

test('MT-4/cancel-deletion: valid token clears deleted_at and returns redirect', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // Use signInAsTestUser so the profile row is guaranteed to exist
  // (the auth trigger fires as part of the sign-in flow).
  const session = await signInAsTestUser(page);
  const { userId } = session;

  // Mark the account for deletion (simulates requestAccountDeletion).
  await setProfileDeletedAt(userId, new Date().toISOString());

  // Generate a valid, fresh cancel token using the same secret the server uses.
  const tokenSecret = mustEnv('ACCOUNT_DELETION_TOKEN_SECRET');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = generateCancelToken(userId, tokenSecret, exp);

  try {
    // Hit the cancel route without following the magic-link redirect.
    // The server-side work (jti insert + profile update) completes before
    // the 3xx response is sent, so stopping at the first redirect is enough
    // to assert the DB was updated.
    const response = await page.request.get(
      `/auth/otkazi-brisanje?token=${encodeURIComponent(token)}`,
      { maxRedirects: 0 },
    );

    // Route must redirect (3xx) — not return an error page.
    expect([301, 302, 303, 307, 308]).toContain(response.status());

    const location = response.headers().location;
    // An error path would redirect to /prijava?deletion_cancel=...
    expect(location).not.toMatch(/deletion_cancel=/u);

    // Most important: profile.deleted_at must be null now.
    const { createClient: makeAdminClient } = await import('@supabase/supabase-js');
    const admin = makeAdminClient(
      mustEnv('NEXT_PUBLIC_SUPABASE_URL'),
      mustEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: profile, error } = await admin
      .from('profiles')
      .select('deleted_at')
      .eq('id', userId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(profile?.deleted_at).toBeNull();
  } finally {
    await cleanupTestUser(userId);
  }
});

test('MT-4/cancel-deletion: expired token returns error redirect', async ({ page }) => {
  test.setTimeout(30_000);

  const session = await signInAsTestUser(page);
  const { userId } = session;

  const tokenSecret = mustEnv('ACCOUNT_DELETION_TOKEN_SECRET');
  // exp already in the past → token expired
  const exp = Math.floor(Date.now() / 1000) - 10;
  const expiredToken = generateCancelToken(userId, tokenSecret, exp);

  try {
    const response = await page.request.get(
      `/auth/otkazi-brisanje?token=${encodeURIComponent(expiredToken)}`,
      { maxRedirects: 0 },
    );

    expect([301, 302, 303, 307, 308]).toContain(response.status());
    const location = response.headers().location;
    expect(location).toMatch(/deletion_cancel=/u);
  } finally {
    await cleanupTestUser(userId);
  }
});
