#!/usr/bin/env node
/**
 * Batch invite-code generator (F4-E2-T1).
 *
 * Usage:
 *   pnpm tsx scripts/generate-invite-codes.mjs            # 20 codes, no notes
 *   pnpm tsx scripts/generate-invite-codes.mjs 5          # 5 codes
 *   pnpm tsx scripts/generate-invite-codes.mjs 5 emina    # 5 codes, all noted "emina"
 *   pnpm tsx scripts/generate-invite-codes.mjs 20 > invites-batch-1.csv
 *
 * Output: CSV to stdout — one row per generated code:
 *   code,notes,expires_at
 *   AB23CDEF,,2026-06-17T12:00:00.000Z
 *   ...
 *
 * Codes are inserted into `public.invite_codes` via the service-role client.
 * They expire 30 days after creation by default (DB column default).
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Don't commit the CSV — gitignore covers `invites-batch-*.csv`.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

// Non-ambiguous alphabet: uppercase A–Z minus I/O, digits 2–9 (no 0/1).
// 32 characters total → 32^8 ≈ 1.1 trillion code space, ample for any beta.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

function generateCode() {
  // randomBytes(N) → uniform bytes; modulo by alphabet length is biased toward
  // smaller indexes when 256 % 32 ≠ 0. With 32 chars (256/32=8 exact), the
  // bias is ZERO. Good.
  const bytes = randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.development.local first.',
    );
    process.exit(2);
  }

  const count = Number(process.argv[2] ?? 20);
  const notes = process.argv[3] ?? null;
  if (!Number.isFinite(count) || count <= 0 || count > 200) {
    console.error('Count must be 1–200.');
    process.exit(2);
  }

  // Generate up to N unique codes. With a 32^8 space and N ≤ 200, collisions
  // are statistically impossible — but use a Set anyway as a safety belt.
  const codes = new Set();
  while (codes.size < count) {
    codes.add(generateCode());
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = [...codes].map((code) => ({ code, notes }));
  const { data, error } = await supabase
    .from('invite_codes')
    .insert(rows)
    .select('code, notes, expires_at');

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  // CSV header on stderr so `> invites.csv` captures only the data.
  process.stdout.write('code,notes,expires_at\n');
  for (const row of data) {
    const escapedNotes = row.notes
      ? `"${String(row.notes).replace(/"/g, '""')}"`
      : '';
    process.stdout.write(`${row.code},${escapedNotes},${row.expires_at}\n`);
  }

  console.error(`Inserted ${String(data.length)} codes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
