/**
 * Lighthouse (mobile) na ključnim rutama s prijavljenom E2E sesijom.
 *
 * Preduslovi:
 * - Lokalni Supabase: `pnpm exec supabase start` i (preporučeno) `pnpm exec supabase db reset`
 * - Aplikacija u **development** režimu (ruta `/api/test-auth/login` ne radi u `next start` / production)
 *   Npr. `pnpm run e2e:web` (http://127.0.0.1:4173) ili `pnpm dev` i `E2E_BASE_URL=http://127.0.0.1:3000`
 * - U `.env.local` (ili okruženju) isti `NEXT_PUBLIC_SUPABASE_*` kao za E2E
 *
 * Pokretanje: `pnpm run lighthouse:pages`
 *
 * Izlaz: `lighthouse-reports/*.report.json` i `*.report.html`, u konzoli zbirni rezultat.
 * Opciono: `LIGHTHOUSE_STRICT=1` — izlaz 1 ako Performance < 0.9 ili A11y < 1.0
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'lighthouse-reports');
const lighthouseCli = join(repoRoot, 'node_modules', 'lighthouse', 'cli', 'index.js');

const KEY_PATHS = ['/pocetna', '/transakcije', '/racuni'];

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

function loadEnvLocal() {
  const p = join(repoRoot, '.env.local');
  if (!existsSync(p)) return {};
  const lines = readFileSync(p, 'utf8').split(/\r?\n/u);
  const o = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    o[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1');
  }
  return o;
}

const envFile = loadEnvLocal();

function must(name) {
  const v = process.env[name] ?? envFile[name];
  if (!v) throw new Error(`Nedostaje ${name} (okruženje ili .env.local).`);
  return v;
}

function e2eBaseUrl() {
  const raw = process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';
  return raw.replace(/localhost/gu, '127.0.0.1');
}

function applyLocalSupabaseEnv() {
  const useRemote = process.env.E2E_REMOTE_SUPABASE === '1';
  if (useRemote) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = must('NEXT_PUBLIC_SUPABASE_URL');
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = must('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.env.SUPABASE_SERVICE_ROLE_KEY = must('SUPABASE_SERVICE_ROLE_KEY');
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_LOCAL_DEMO_ANON;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_LOCAL_DEMO_SERVICE;
  }
}

function randomEmail(tag) {
  const n = `${String(Date.now())}-${String(Math.floor(Math.random() * 1_000_000))}`;
  return `lh-${tag}-${n}@example.com`;
}

function setCookieFromSetCookieLines(lines) {
  return lines
    .map((line) => String(line).split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function getSetCookieLines(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  if (single) return [single];
  return [];
}

async function ensureDefaultAccount(admin, userId) {
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

/**
 * Kreira korisnika, učitava sesiju u kolačiće, vraća `Cookie` zaglavlje za Lighthouse.
 */
async function e2eCookieHeader() {
  const url = e2eBaseUrl();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anon || !service) {
    throw new Error('Nedostaju varijable za Supabase nakon applyLocalSupabaseEnv.');
  }
  const admin = createClient(supabaseUrl, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(supabaseUrl, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = randomEmail('pages');
  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error) throw generated.error;
  const { data } = generated;
  const userId = data.user.id;
  const token = data.properties.email_otp;
  if (!userId || !token) throw new Error('generateLink nema user id ili email_otp.');

  let accessToken;
  let refreshToken;
  const v1 = await userClient.auth.verifyOtp({ email, token, type: 'email' });
  if (!v1.error && v1.data.session) {
    accessToken = v1.data.session.access_token;
    refreshToken = v1.data.session.refresh_token;
  } else {
    const v2 = await userClient.auth.verifyOtp({ email, token, type: 'signup' });
    if (v2.error || !v2.data.session) {
      const msg = v1.error?.message ?? v2.error?.message ?? 'nema session';
      throw new Error(`verifyOtp: ${msg}`);
    }
    accessToken = v2.data.session.access_token;
    refreshToken = v2.data.session.refresh_token;
  }

  await ensureDefaultAccount(admin, userId);
  const secret = process.env.E2E_AUTH_BYPASS_SECRET ?? 'local-e2e-secret';
  const loginRes = await fetch(`${url}/api/test-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, refreshToken, secret }),
  });

  if (loginRes.status === 404) {
    throw new Error(
      'test-auth vraća 404 — vjerovatno je `next start` (production) gdje je ruta isključena. ' +
        'Koristi `next dev` (npr. pnpm run e2e:web).',
    );
  }
  if (!loginRes.ok) {
    const t = await loginRes.text();
    throw new Error(`test-auth: HTTP ${String(loginRes.status)} ${t}`);
  }

  const setLines = getSetCookieLines(loginRes);
  if (setLines.length === 0) {
    throw new Error('Nema Set-Cookie odgovora; provjeri da server radi i da je ruta /api/test-auth/login dostupna.');
  }
  return { cookie: setCookieFromSetCookieLines(setLines), userId, admin };
}

function runLighthouse(absolutePageUrl, slug, cookie) {
  const headerPath = join(outDir, `headers-${slug}.json`);
  writeFileSync(headerPath, JSON.stringify({ Cookie: cookie }, null, 0), 'utf8');
  const baseOut = join(outDir, slug);
  execFileSync(
    process.execPath,
    [
      lighthouseCli,
      absolutePageUrl,
      `--extra-headers=${headerPath.replace(/\\/gu, '/')}`,
      '--form-factor=mobile',
      '--only-categories=performance,accessibility',
      '--output=json',
      '--output=html',
      `--output-path=${baseOut}`,
      '--chrome-flags=--headless --no-sandbox --disable-gpu',
      '--quiet',
    ],
    { stdio: 'inherit', cwd: repoRoot },
  );
}

function readReportJson(slug) {
  const p = join(outDir, `${slug}.report.json`);
  if (!existsSync(p)) {
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

async function main() {
  if (!existsSync(lighthouseCli)) {
    console.error('Nema lighthouse CLI. Instaliraj: pnpm add -D lighthouse');
    process.exit(1);
  }

  applyLocalSupabaseEnv();
  mkdirSync(outDir, { recursive: true });

  const base = e2eBaseUrl().replace(/\/+$/u, '');

  let userId;
  let admin;
  let cookie;
  try {
    const session = await e2eCookieHeader();
    userId = session.userId;
    admin = session.admin;
    cookie = session.cookie;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Greška pri E2E prijavi:\n', msg);
    process.exit(1);
  }

  try {
    for (const path of KEY_PATHS) {
      const slug = path === '/' ? 'root' : path.replace(/^\//u, '').replaceAll('/', '-');
      const pageUrl = `${base}${path}`;
      console.log(`\n→ Lighthouse: ${pageUrl}\n`);
      try {
        runLighthouse(pageUrl, slug, cookie);
      } catch {
        process.exitCode = 1;
        console.error(`Lighthouse pao za ${path}`);
      }
    }
  } finally {
    if (userId && admin) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.error('Napomena: brisanje E2E korisnika nije uspjelo:', error.message);
    }
  }

  console.log('\n--- Rezultat (0–100) ---\n');
  let failStrict = false;
  const strict = process.env.LIGHTHOUSE_STRICT === '1';
  for (const path of KEY_PATHS) {
    const slug = path === '/' ? 'root' : path.replace(/^\//u, '').replaceAll('/', '-');
    const lhr = readReportJson(slug);
    if (!lhr?.categories) {
      console.log(`${path}: nema .report.json`);
      continue;
    }
    const p = lhr.categories.performance?.score;
    const a = lhr.categories.accessibility?.score;
    const ps = p == null ? '—' : String(Math.round(p * 100));
    const as = a == null ? '—' : String(Math.round(a * 100));
    console.log(`${path}  performance: ${ps}  accessibility: ${as}`);
    if (strict) {
      if (p == null || p < 0.9) failStrict = true;
      if (a == null || a < 1) failStrict = true;
    }
  }

  try {
    for (const f of readdirSync(outDir)) {
      if (f.startsWith('headers-') && f.endsWith('.json')) {
        unlinkSync(join(outDir, f));
      }
    }
  } catch {
    /* */
  }

  if (strict && failStrict) {
    console.error('\nLIGHTHOUSE_STRICT=1: neki rezultati ispod praga (Performance ≥ 90, A11y 100).');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
