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

const rawArgs = process.argv.slice(2);
const tolerant = rawArgs.includes('--tolerant');
const extraArgs = rawArgs.filter((arg) => arg !== '--tolerant');
const args = ['gen', 'types', 'typescript', ...(extraArgs.length ? extraArgs : ['--local'])];

function toleratedExit(message, code) {
  if (tolerant) {
    console.log(`supabase-gen-types: ${message} (tolerated, no file written).`);
    process.exit(0);
  }
  console.error(message);
  process.exit(code);
}

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
  toleratedExit(`Failed to spawn supabase CLI: ${err.message}`, 1);
});

child.on('close', async (code) => {
  if (code !== 0) {
    if (tolerant) {
      console.log(
        `supabase-gen-types: CLI exited ${String(code ?? 1)} (tolerated, no file written).`,
      );
      process.exit(0);
    }
    process.stderr.write(stderr);
    process.exit(code ?? 1);
  }
  if (!stdout.includes('export type Database')) {
    toleratedExit('supabase gen types produced unexpected output. Aborting write.', 1);
    return;
  }

  // Run the generated source through Prettier so repeat runs produce a
  // deterministic file. The Supabase CLI emits its own style (no semicolons,
  // multi-line Json type, etc.), which otherwise leaves `git status` dirty
  // after every `pnpm install` triggered postinstall.
  let formatted = stdout;
  try {
    const prettier = await import('prettier');
    const config = (await prettier.resolveConfig(outFile)) ?? {};
    formatted = await prettier.format(stdout, {
      ...config,
      parser: 'typescript',
      filepath: outFile,
    });
  } catch (err) {
    console.warn(
      `supabase-gen-types: prettier format skipped (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  await writeFile(outFile, formatted, 'utf8');
  console.log(`Wrote ${path.relative(projectRoot, outFile)} (${String(formatted.length)} bytes).`);
});
