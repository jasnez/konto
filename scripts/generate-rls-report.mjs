#!/usr/bin/env node
/**
 * RLS audit HTML report generator (F4-E1-T1).
 *
 * Reads vitest's `--reporter=json` output (`tests/security/rls-results.json`)
 * and renders a single self-contained HTML page summarising pass/fail per
 * table. Output: `tests/security/RLS_REPORT.html`.
 *
 * Usage:
 *   pnpm test:rls:report    # runs vitest with json reporter then this script
 *
 * Layout:
 *   - Top: pass/fail/skip totals + run timestamp.
 *   - Per-table table (one row per *.test.ts under __tests__/rls/) with
 *     status badge, duration, and any failure messages.
 *
 * The HTML is plain-old static — no JS — so the GitHub Actions artifact is
 * usable in any browser without privileges.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const RESULTS_PATH = path.resolve('tests/security/rls-results.json');
const HTML_PATH = path.resolve('tests/security/RLS_REPORT.html');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function badge(state) {
  const colors = {
    passed: '#16a34a',
    failed: '#dc2626',
    skipped: '#a1a1aa',
  };
  return `<span style="background:${colors[state] ?? '#9ca3af'};color:#fff;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase">${state}</span>`;
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(RESULTS_PATH, 'utf8');
  } catch (err) {
    console.error(`Could not read ${RESULTS_PATH}. Did the vitest run finish?`);
    console.error(err);
    process.exit(2);
  }

  const data = JSON.parse(raw);

  // vitest json reporter shape: { testResults: [{ name, status, assertionResults: [...] }, ...] }
  const fileSummaries = (data.testResults ?? []).map((tr) => {
    const fileName = path.basename(tr.name ?? '').replace('.test.ts', '');
    const assertions = tr.assertionResults ?? [];
    const passed = assertions.filter((a) => a.status === 'passed').length;
    const failed = assertions.filter((a) => a.status === 'failed').length;
    const skipped = assertions.filter(
      (a) => a.status === 'pending' || a.status === 'skipped',
    ).length;
    const duration = tr.endTime && tr.startTime ? tr.endTime - tr.startTime : 0;
    const failureMessages = assertions
      .filter((a) => a.status === 'failed')
      .flatMap((a) => a.failureMessages ?? []);
    let state = 'passed';
    if (failed > 0) state = 'failed';
    else if (passed === 0 && skipped > 0) state = 'skipped';
    return { fileName, passed, failed, skipped, duration, state, failureMessages };
  });

  fileSummaries.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const totals = fileSummaries.reduce(
    (acc, s) => ({
      files: acc.files + 1,
      passed: acc.passed + s.passed,
      failed: acc.failed + s.failed,
      skipped: acc.skipped + s.skipped,
    }),
    { files: 0, passed: 0, failed: 0, skipped: 0 },
  );

  const generatedAt = new Date().toISOString();

  const rows = fileSummaries
    .map(
      (s) => `
        <tr>
          <td><code>${escapeHtml(s.fileName)}</code></td>
          <td>${badge(s.state)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${String(s.passed)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${String(s.failed)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${String(s.skipped)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">${String(Math.round(s.duration))}ms</td>
        </tr>
        ${
          s.failureMessages.length > 0
            ? `<tr><td colspan="6"><pre style="margin:0;padding:8px;background:#fef2f2;color:#7f1d1d;border-radius:6px;overflow-x:auto;font-size:12px">${escapeHtml(s.failureMessages.join('\n\n'))}</pre></td></tr>`
            : ''
        }
      `,
    )
    .join('');

  const overallState = totals.failed > 0 ? 'failed' : 'passed';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Konto RLS audit report</title>
<meta name="generator" content="scripts/generate-rls-report.mjs">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #0a0a0b; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 1.5rem; }
  .totals { display: flex; gap: 1.5rem; padding: 1rem 1.25rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 1.5rem; }
  .totals .num { font-size: 1.75rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
  .totals .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
  code { font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 13px; }
</style>
</head>
<body>
<h1>RLS audit report ${badge(overallState)}</h1>
<p class="meta">Generated <time datetime="${generatedAt}">${generatedAt}</time> · ${String(totals.files)} files · F4-E1-T1</p>

<div class="totals">
  <div><div class="num" style="color:#16a34a">${String(totals.passed)}</div><div class="label">passed</div></div>
  <div><div class="num" style="color:${totals.failed > 0 ? '#dc2626' : '#a1a1aa'}">${String(totals.failed)}</div><div class="label">failed</div></div>
  <div><div class="num" style="color:#a1a1aa">${String(totals.skipped)}</div><div class="label">skipped</div></div>
</div>

<table>
  <thead>
    <tr>
      <th>Test file</th>
      <th>Status</th>
      <th style="text-align:right">Passed</th>
      <th style="text-align:right">Failed</th>
      <th style="text-align:right">Skipped</th>
      <th style="text-align:right">Duration</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  await fs.mkdir(path.dirname(HTML_PATH), { recursive: true });
  await fs.writeFile(HTML_PATH, html, 'utf8');
  console.log(`Wrote ${HTML_PATH}`);
  console.log(`Totals: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped across ${totals.files} files.`);
  if (totals.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
