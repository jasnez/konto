import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface QaUserSession {
  userId: string;
}

const envFromFile = loadEnvLocal();

function loadEnvLocal(): Record<string, string> {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return {};

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);
  const parsed: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1');
    parsed[key] = value;
  }
  return parsed;
}

function mustEnv(name: string): string {
  const value = process.env[name] ?? envFromFile[name];
  if (!value) {
    throw new Error(`Missing required env var for E2E: ${name}`);
  }
  return value;
}

function makeAdminClient() {
  return createClient(mustEnv('NEXT_PUBLIC_SUPABASE_URL'), mustEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeAnonClient() {
  return createClient(
    mustEnv('NEXT_PUBLIC_SUPABASE_URL'),
    mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

function randomEmail(tag: string): string {
  const nonce = `${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  return `qa-${tag}-${nonce}@konto.local`;
}

export async function signInAsTestUser(page: Page): Promise<QaUserSession> {
  const admin = makeAdminClient();
  const anon = makeAnonClient();
  const email = randomEmail('e2e');
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (generated.error) throw generated.error;

  const userId = generated.data.user.id;
  const token = generated.data.properties.email_otp;
  if (!userId || !token) {
    throw new Error('Failed to prepare OTP login payload for E2E user.');
  }

  const verified = await anon.auth.verifyOtp({ email, token, type: 'signup' });
  if (verified.error || !verified.data.session) {
    throw new Error(`Failed to verify E2E OTP: ${verified.error?.message ?? 'no session'}`);
  }

  const secret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';
  const signInResponse = await page.request.post('/api/test-auth/login', {
    data: {
      accessToken: verified.data.session.access_token,
      refreshToken: verified.data.session.refresh_token,
      secret,
    },
  });
  if (!signInResponse.ok()) {
    const body = await signInResponse.text();
    throw new Error(
      `E2E login helper failed with status ${String(signInResponse.status())}: ${body}`,
    );
  }

  await page.goto('/pocetna', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/pocetna(?:\?.*)?$/);

  return { userId };
}

export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = makeAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
