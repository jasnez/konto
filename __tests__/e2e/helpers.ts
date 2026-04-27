import { expect, type Locator, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '@/supabase/types';

export function e2eWebKitPressFillProject(projectName: string): boolean {
  return projectName === 'mobile-safari';
}

/**
 * WebKit (mobile-safari) can drop a single `fill` on RHF fields — use sequential keypresses.
 */
export async function e2eFill(locator: Locator, text: string, usePress: boolean): Promise<void> {
  await locator.click();
  if (usePress) {
    await locator.clear();
    if (text.length > 0) {
      await locator.pressSequentially(text, { delay: 8 });
    }
  } else {
    await locator.fill(text);
  }
}

interface QaUserSession {
  userId: string;
  email: string;
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

export function mustEnv(name: string): string {
  const value = process.env[name] ?? envFromFile[name];
  if (!value) {
    throw new Error(`Missing required env var for E2E: ${name}`);
  }
  return value;
}

function makeAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    mustEnv('NEXT_PUBLIC_SUPABASE_URL'),
    mustEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

function makeAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    mustEnv('NEXT_PUBLIC_SUPABASE_URL'),
    mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

function randomEmail(tag: string): string {
  const nonce = `${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  return `qa-${tag}-${nonce}@example.com`;
}

async function ensureDefaultE2EAccount(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { count, error: countError } = await admin
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (countError) throw countError;
  if (count !== null && count > 0) return;

  const { error } = await admin.from('accounts').insert({
    user_id: userId,
    name: 'E2E Tekući',
    type: 'checking',
    currency: 'BAM',
  });
  if (error) throw error;
}

export async function getMagicLinkActionForEmail(
  email: string,
): Promise<{ actionUrl: string; userId: string }> {
  const admin = makeAdminClient();
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (generated.error) throw generated.error;

  const { data } = generated;
  const actionUrl = data.properties.action_link;
  const userId = data.user.id;
  if (!actionUrl || !userId) {
    throw new Error('generateLink did not return action_link or user id for E2E.');
  }
  return { actionUrl: rewriteSupabaseActionLinkForE2E(actionUrl), userId };
}

/** Marks profile for scheduled deletion (middleware should send user to /obrisan). */
export async function setProfileDeletedAt(userId: string, isoTimestamp: string): Promise<void> {
  const admin = makeAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ deleted_at: isoTimestamp })
    .eq('id', userId);
  if (error) throw error;
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

  const { data } = generated;
  const userId = data.user.id;
  const token = data.properties.email_otp;
  if (!userId || !token) {
    throw new Error('Failed to prepare OTP login payload for E2E user.');
  }

  let accessToken: string;
  let refreshToken: string;
  const verifiedEmail = await anon.auth.verifyOtp({ email, token, type: 'email' });
  if (!verifiedEmail.error && verifiedEmail.data.session) {
    accessToken = verifiedEmail.data.session.access_token;
    refreshToken = verifiedEmail.data.session.refresh_token;
  } else {
    const verifiedSignup = await anon.auth.verifyOtp({ email, token, type: 'signup' });
    if (verifiedSignup.error || !verifiedSignup.data.session) {
      throw new Error(
        `Failed to verify E2E OTP: ${verifiedEmail.error?.message ?? verifiedSignup.error?.message ?? 'no session'}`,
      );
    }
    accessToken = verifiedSignup.data.session.access_token;
    refreshToken = verifiedSignup.data.session.refresh_token;
  }

  await ensureDefaultE2EAccount(admin, userId);
  await applySessionToPage(page, accessToken, refreshToken);
  await page.goto('/racuni', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/racuni(?:\?.*)?$/);

  return { userId, email };
}

function e2eAppOrigin(): string {
  const raw =
    process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
  return raw.replace(/localhost/gu, '127.0.0.1');
}

/**
 * GoTrue `action_link` often embeds `redirect_to` (including URL-encoded) pointing at dev `site_url`
 * (e.g. localhost:3000). Rewrite every occurrence so the browser lands on the Playwright app origin.
 */
function rewriteSupabaseActionLinkForE2E(actionUrl: string): string {
  const origin = e2eAppOrigin();
  const { hostname, port } = new URL(origin);
  const encHostPort = `${hostname}%3A${port}`;
  let out = actionUrl;
  for (const legacy of ['http://localhost:3000', 'http://127.0.0.1:3000'] as const) {
    out = out.replaceAll(legacy, origin);
  }
  out = out.replaceAll(encodeURIComponent('http://localhost:3000'), encodeURIComponent(origin));
  out = out.replaceAll(encodeURIComponent('http://127.0.0.1:3000'), encodeURIComponent(origin));
  out = out.replaceAll('localhost%3A3000', encHostPort);
  out = out.replaceAll('127.0.0.1%3A3000', encHostPort);
  return out;
}

async function applySessionToPage(
  page: Page,
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const secret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';
  const signInResponse = await page.request.post(`${e2eAppOrigin()}/api/test-auth/login`, {
    // The route requires this custom header in addition to the shared secret;
    // it's cheap defense-in-depth against drive-by POSTs.
    headers: { 'x-e2e-auth': 'konto-playwright' },
    data: {
      accessToken,
      refreshToken,
      secret,
    },
  });
  if (!signInResponse.ok()) {
    const body = await signInResponse.text();
    throw new Error(
      `E2E login helper failed with status ${String(signInResponse.status())}: ${body}`,
    );
  }
}

/** Clicks the DOM node directly (avoids mobile FAB / fixed footers blocking hit-testing on WebKit). */
export async function clickDomButton(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    const b = el as HTMLButtonElement;
    b.scrollIntoView({ block: 'center', inline: 'nearest' });
    b.click();
  });
}

export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = makeAdminClient();
  // Ukloni uvozne sesije prije auth brisanja (parsed_transactions CASCADE; transakcije dobiju SET NULL na batch).
  const { error: importErr } = await admin.from('import_batches').delete().eq('user_id', userId);
  if (importErr) {
    console.error('cleanup_import_batches', { userId, error: importErr.message });
  }
  // Eksplicitno ukloni transakcije (lokalni GoTrue ponekad ne kaskadno obriše korisnika nakon import PDF-a).
  const { error: txErr } = await admin.from('transactions').delete().eq('user_id', userId);
  if (txErr) {
    console.error('cleanup_transactions', { userId, error: txErr.message });
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export interface E2eParsedTxSeed {
  transaction_date: string;
  amount_minor: number;
  currency: string;
  raw_description: string;
}

/**
 * Simulates a successful PDF parse for E2E: staging rows + batch `ready`.
 * Deletes existing `parsed_transactions` for the batch first (idempotent if parse runs twice in dev Strict Mode).
 */
export async function e2eSeedImportBatchReady(input: {
  batchId: string;
  userId: string;
  transactions: E2eParsedTxSeed[];
  parseConfidence?: 'high' | 'medium' | 'low';
  warnings?: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<void> {
  const admin = makeAdminClient();
  const {
    batchId,
    userId,
    transactions,
    parseConfidence = 'high',
    warnings = [],
    periodStart = '2026-01-01',
    periodEnd = '2026-01-31',
  } = input;

  const { error: delErr } = await admin
    .from('parsed_transactions')
    .delete()
    .eq('batch_id', batchId);
  if (delErr) {
    throw new Error(`e2eSeedImportBatchReady delete staged: ${delErr.message}`);
  }

  if (transactions.length > 0) {
    const rows = transactions.map((t) => ({
      batch_id: batchId,
      user_id: userId,
      transaction_date: t.transaction_date,
      amount_minor: t.amount_minor,
      currency: t.currency,
      raw_description: t.raw_description,
      reference: null as string | null,
      status: 'pending_review' as const,
      parse_confidence: parseConfidence,
      merchant_id: null as string | null,
      category_id: null as string | null,
      categorization_source: 'none' as const,
      categorization_confidence: 0,
      selected_for_import: true,
    }));

    const { error: insErr } = await admin.from('parsed_transactions').insert(rows);
    if (insErr) {
      throw new Error(`e2eSeedImportBatchReady insert: ${insErr.message}`);
    }
  }

  const { error: uErr } = await admin
    .from('import_batches')
    .update({
      status: 'ready',
      transaction_count: transactions.length,
      parse_confidence: parseConfidence,
      parse_warnings: warnings,
      statement_period_start: periodStart,
      statement_period_end: periodEnd,
      error_message: null,
    })
    .eq('id', batchId)
    .eq('user_id', userId);

  if (uErr) {
    throw new Error(`e2eSeedImportBatchReady update batch: ${uErr.message}`);
  }
}

/**
 * Dva računa na /import da odabir računa bude stvaran (E2E import flow).
 * Idempotentno: ne radi ništa ako korisnik već ima ≥2 neobrisanih računa.
 */
export async function ensureTwoE2EAccountsForImport(userId: string): Promise<void> {
  const admin = makeAdminClient();
  const { data: rows, error: listErr } = await admin
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (listErr) throw listErr;
  if (rows.length >= 2) return;
  const { error } = await admin.from('accounts').insert({
    user_id: userId,
    name: 'E2E Štedni',
    type: 'savings',
    currency: 'BAM',
  });
  if (error) throw error;
}

/**
 * Eksplicitno uklanjanje uvozne sesije (korak cleanup u sporom import E2E).
 */
export async function e2eDeleteImportBatchById(batchId: string, userId: string): Promise<void> {
  const admin = makeAdminClient();
  const { error } = await admin
    .from('import_batches')
    .delete()
    .eq('id', batchId)
    .eq('user_id', userId);
  if (error) {
    console.error('e2eDeleteImportBatchById', { batchId, userId, message: error.message });
  }
}

/** Spori import E2E u GitHub CI samo na `main` (ne na pull request). */
export function e2eShouldRunSlowImportOnCi(): boolean {
  if (!process.env.CI) return true;
  return process.env.GITHUB_REF === 'refs/heads/main';
}
