// @vitest-environment node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/parser/extract-text';
import { parseStatementWithLLM } from '@/lib/parser/llm-parse';
import { ocrFallback } from '@/lib/parser/ocr-fallback';
import { redactPII } from '@/lib/parser/redact-pii';

interface ParsedTransaction {
  date: string;
  amountMinor: number;
  currency: string;
  description: string;
  reference?: string | null;
}

interface GoldenExpected {
  statementId: string;
  bank: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  transactions: ParsedTransaction[];
}

interface ScoreAccumulator {
  expected: number;
  parsed: number;
  matched: number;
}

interface BenchResult {
  statementId: string;
  bank: string;
  expectedCount: number;
  parsedCount: number;
  matched: number;
  precision: number;
  recall: number;
  f1: number;
  warnings: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const goldenDir = path.join(repoRoot, 'tests', 'parser', 'golden');
const reportPath = path.join(repoRoot, 'tests', 'parser', 'REPORT.md');

const RUN_BENCHMARK = process.env.RUN_PARSER_BENCHMARK === '1';
const MIN_PER_BANK_F1 = 0.9;
const MIN_OVERALL_F1 = 0.93;

const runDescribe = RUN_BENCHMARK ? describe : describe.skip;

const benchmarkResults: BenchResult[] = [];

function normalizeDescription(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toUpperCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    new Array<number>(n + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function isDescriptionMatch(expected: string, parsed: string): boolean {
  const a = normalizeDescription(expected);
  const b = normalizeDescription(parsed);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return true;
  const tolerance = Math.ceil(maxLength * 0.1);
  return levenshtein(a, b) <= tolerance;
}

function txMatches(expected: ParsedTransaction, parsed: ParsedTransaction): boolean {
  return (
    expected.date === parsed.date &&
    expected.amountMinor === parsed.amountMinor &&
    expected.currency.toUpperCase() === parsed.currency.toUpperCase() &&
    isDescriptionMatch(expected.description, parsed.description)
  );
}

function evaluateStatement(expected: ParsedTransaction[], parsed: ParsedTransaction[]) {
  const usedParsed = new Set<number>();
  let matched = 0;

  for (const exp of expected) {
    for (let i = 0; i < parsed.length; i++) {
      if (usedParsed.has(i)) continue;
      if (!txMatches(exp, parsed[i])) continue;
      usedParsed.add(i);
      matched++;
      break;
    }
  }

  const precision = parsed.length === 0 ? 0 : matched / parsed.length;
  const recall = expected.length === 0 ? 0 : matched / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { matched, precision, recall, f1 };
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function scoreFromAccumulator(acc: ScoreAccumulator) {
  const precision = acc.parsed === 0 ? 0 : acc.matched / acc.parsed;
  const recall = acc.expected === 0 ? 0 : acc.matched / acc.expected;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

async function loadGoldenEntries() {
  const files = await readdir(goldenDir);
  const expectedFiles = files.filter((name) => name.endsWith('.expected.json')).sort();
  return expectedFiles;
}

runDescribe('@slow parser accuracy benchmark', () => {
  it('computes precision/recall/F1 on golden dataset and enforces thresholds', async () => {
    const expectedFiles = await loadGoldenEntries();
    expect(expectedFiles.length).toBeGreaterThanOrEqual(25);

    const byBank = new Map<string, ScoreAccumulator>();

    for (const expectedFile of expectedFiles) {
      const expectedPath = path.join(goldenDir, expectedFile);
      const pdfPath = path.join(goldenDir, expectedFile.replace('.expected.json', '.pdf'));
      const expectedJson = await readFile(expectedPath, 'utf8');
      const expected = JSON.parse(expectedJson) as GoldenExpected;
      const pdf = await readFile(pdfPath);
      const pdfBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);

      // Full pipeline: extract -> optional OCR fallback -> redact -> LLM parse.
      const extracted = await extractPdfText(pdfBuffer);
      let text = extracted.text;
      if (!extracted.hasText && !extracted.ocrUsed) {
        text = await ocrFallback(pdfBuffer);
      }
      const redacted = redactPII(text);
      const parsed = await parseStatementWithLLM(redacted, expected.bank);

      const statementScore = evaluateStatement(expected.transactions, parsed.transactions);
      benchmarkResults.push({
        statementId: expected.statementId,
        bank: expected.bank,
        expectedCount: expected.transactions.length,
        parsedCount: parsed.transactions.length,
        matched: statementScore.matched,
        precision: statementScore.precision,
        recall: statementScore.recall,
        f1: statementScore.f1,
        warnings: parsed.warnings,
      });

      const acc = byBank.get(expected.bank) ?? { expected: 0, parsed: 0, matched: 0 };
      acc.expected += expected.transactions.length;
      acc.parsed += parsed.transactions.length;
      acc.matched += statementScore.matched;
      byBank.set(expected.bank, acc);
    }

    const bankSummaries = [...byBank.entries()].map(([bank, acc]) => ({
      bank,
      ...scoreFromAccumulator(acc),
    }));

    for (const bank of bankSummaries) {
      expect(
        bank.f1,
        `Bank ${bank.bank} F1 (${percentage(bank.f1)}) is below ${(MIN_PER_BANK_F1 * 100).toFixed(0)}%`,
      ).toBeGreaterThanOrEqual(MIN_PER_BANK_F1);
    }

    const overall = [...byBank.values()].reduce(
      (sum, current) => ({
        expected: sum.expected + current.expected,
        parsed: sum.parsed + current.parsed,
        matched: sum.matched + current.matched,
      }),
      { expected: 0, parsed: 0, matched: 0 } satisfies ScoreAccumulator,
    );
    const overallScore = scoreFromAccumulator(overall);

    expect(
      overallScore.f1,
      `Overall F1 (${percentage(overallScore.f1)}) is below ${(MIN_OVERALL_F1 * 100).toFixed(0)}%`,
    ).toBeGreaterThanOrEqual(MIN_OVERALL_F1);
  }, 180_000);
});

afterAll(async () => {
  if (!RUN_BENCHMARK || benchmarkResults.length === 0) return;

  const byBank = new Map<string, ScoreAccumulator>();
  for (const row of benchmarkResults) {
    const acc = byBank.get(row.bank) ?? { expected: 0, parsed: 0, matched: 0 };
    acc.expected += row.expectedCount;
    acc.parsed += row.parsedCount;
    acc.matched += row.matched;
    byBank.set(row.bank, acc);
  }

  const bankRows = [...byBank.entries()]
    .map(([bank, acc]) => ({ bank, ...scoreFromAccumulator(acc), ...acc }))
    .sort((a, b) => a.bank.localeCompare(b.bank));

  const overall = bankRows.reduce(
    (sum, row) => ({
      expected: sum.expected + row.expected,
      parsed: sum.parsed + row.parsed,
      matched: sum.matched + row.matched,
    }),
    { expected: 0, parsed: 0, matched: 0 } satisfies ScoreAccumulator,
  );
  const overallScore = scoreFromAccumulator(overall);

  const lines = [
    '# Parser Accuracy Benchmark Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Thresholds',
    '',
    `- Per bank F1 >= ${(MIN_PER_BANK_F1 * 100).toFixed(0)}%`,
    `- Overall F1 >= ${(MIN_OVERALL_F1 * 100).toFixed(0)}%`,
    '',
    '## Per Bank Metrics',
    '',
    '| Bank | Expected | Parsed | Matched | Precision | Recall | F1 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...bankRows.map(
      (row) =>
        `| ${row.bank} | ${String(row.expected)} | ${String(row.parsed)} | ${String(row.matched)} | ${percentage(row.precision)} | ${percentage(row.recall)} | ${percentage(row.f1)} |`,
    ),
    '',
    '## Overall',
    '',
    `- Expected: ${String(overall.expected)}`,
    `- Parsed: ${String(overall.parsed)}`,
    `- Matched: ${String(overall.matched)}`,
    `- Precision: ${percentage(overallScore.precision)}`,
    `- Recall: ${percentage(overallScore.recall)}`,
    `- F1: ${percentage(overallScore.f1)}`,
    '',
    '## Statement-level Details',
    '',
    '| Statement | Bank | Expected | Parsed | Matched | Precision | Recall | F1 | Warnings |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...benchmarkResults
      .sort((a, b) => a.statementId.localeCompare(b.statementId))
      .map(
        (row) =>
          `| ${row.statementId} | ${row.bank} | ${String(row.expectedCount)} | ${String(row.parsedCount)} | ${String(row.matched)} | ${percentage(row.precision)} | ${percentage(row.recall)} | ${percentage(row.f1)} | ${row.warnings.join('; ') || '-'} |`,
      ),
    '',
    '> This file is auto-generated by `tests/parser/benchmark.test.ts`.',
    '',
  ];

  await writeFile(reportPath, lines.join('\n'), 'utf8');
});
