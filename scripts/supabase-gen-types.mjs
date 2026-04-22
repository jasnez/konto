#!/usr/bin/env node
/**
 * Cross-platform wrapper around `supabase gen types`.
 *
 * The previous approach used shell redirection (`supabase gen types ... >
 * supabase/types.ts`) which breaks on Windows PowerShell because `>` defaults
 * to UTF-16 LE (BOM FF FE). That makes the file unreadable for Prettier,
 * `tsc`, and ESLint. This script spawns the CLI, captures stdout, and writes
 * the file as UTF-8 on any OS.
 *
 * Usage:
 *   node scripts/supabase-gen-types.mjs            # --local (default)
 *   node scripts/supabase-gen-types.mjs --linked
 *   SUPABASE_GEN_SKIP=1 node scripts/supabase-gen-types.mjs   # no-op (CI)
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outFile = path.join(projectRoot, 'supabase', 'types.ts');

if (process.env.SUPABASE_GEN_SKIP === '1') {
  console.log('SUPABASE_GEN_SKIP=1 — skipping type generation.');
  process.exit(0);
}

const extraArgs = process.argv.slice(2);
const args = ['gen', 'types', 'typescript', ...(extraArgs.length ? extraArgs : ['--local'])];

const child = spawn('supabase', args, {
  shell: process.platform === 'win32',
  cwd: projectRoot,
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString('utf8');
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8');
});

child.on('error', (err) => {
  console.error(`Failed to spawn supabase CLI: ${err.message}`);
  process.exit(1);
});

child.on('close', async (code) => {
  if (code !== 0) {
    process.stderr.write(stderr);
    process.exit(code ?? 1);
  }
  if (!stdout.includes('export type Database')) {
    console.error('supabase gen types produced unexpected output. Aborting write.');
    process.stderr.write(stderr);
    process.exit(1);
  }
  await writeFile(outFile, stdout, 'utf8');
  console.log(`Wrote ${path.relative(projectRoot, outFile)} (${stdout.length} bytes).`);
});
