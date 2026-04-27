import type { ParseResult, ParsedTransaction } from './llm-parse';

// 10^11 minor units = 1 billion in major currency — no legitimate retail
// bank statement transaction exceeds this.
const AMOUNT_BOUND = 100_000_000_000n;

// Absolute date sanity window: transactions outside this range are implausible
// regardless of stated statement period.
const ABSOLUTE_DATE_MIN = '2000-01-01';
const ABSOLUTE_DATE_MAX = '2100-01-01';

// Days of slack on each side of the stated statement period.
const PERIOD_SLACK_DAYS = 7;

// Patterns that indicate prompt-injection attempts in description text.
// Detection only — these add a warning but do not remove the transaction,
// since aggressive filtering could discard legitimate rows.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|all|prior)\s+instructions?/iu,
  /\bnew\s+instructions?\b/iu,
  /\bsystem\s*:/iu,
  /\bprompt\s*:/iu,
  /<\s*script/iu,
  /\bassistant\s*:/iu,
  /\[\s*INST\s*\]/iu,
];

// Control characters except tab, newline, and carriage return.
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu;

// HTML tags.
const HTML_TAG_RE = /<[^>]{0,200}>/gu;

// Multiple consecutive whitespace (after stripping) → single space.
const MULTI_SPACE_RE = /\s{2,}/gu;

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDateInRange(date: string, min: string, max: string): boolean {
  return date >= min && date <= max;
}

function sanitizeDescription(raw: string): string {
  return raw
    .replace(CONTROL_CHAR_RE, '')
    .replace(HTML_TAG_RE, '')
    .replace(MULTI_SPACE_RE, ' ')
    .trim();
}

function hasInjectionPattern(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

export interface PlausibilityResult {
  transactions: ParsedTransaction[];
  warnings: string[];
  filteredCount: number;
}

export function validatePlausibility(result: ParseResult): PlausibilityResult {
  const warnings: string[] = [...result.warnings];
  const accepted: ParsedTransaction[] = [];
  let filteredCount = 0;

  const periodMin = result.statementPeriodStart
    ? addDays(result.statementPeriodStart, -PERIOD_SLACK_DAYS)
    : ABSOLUTE_DATE_MIN;
  const periodMax = result.statementPeriodEnd
    ? addDays(result.statementPeriodEnd, PERIOD_SLACK_DAYS)
    : ABSOLUTE_DATE_MAX;

  const effectiveMin = periodMin > ABSOLUTE_DATE_MIN ? periodMin : ABSOLUTE_DATE_MIN;
  const effectiveMax = periodMax < ABSOLUTE_DATE_MAX ? periodMax : ABSOLUTE_DATE_MAX;

  for (const tx of result.transactions) {
    const absAmount = BigInt(Math.abs(tx.amountMinor));

    // Amount bound check.
    if (absAmount >= AMOUNT_BOUND) {
      warnings.push(
        `Transakcija odbačena: iznos ${String(tx.amountMinor)} prelazi granicu od ±10^11 (datum: ${tx.date}).`,
      );
      filteredCount++;
      continue;
    }

    // Date range check.
    if (!isDateInRange(tx.date, effectiveMin, effectiveMax)) {
      warnings.push(
        `Transakcija odbačena: datum ${tx.date} je izvan prihvatljivog perioda [${effectiveMin}, ${effectiveMax}].`,
      );
      filteredCount++;
      continue;
    }

    // Injection detection runs on original text before sanitization so that
    // HTML-tag-based markers (e.g. <script>) are still visible.
    // Sanitize description.
    const cleanedDescription = sanitizeDescription(tx.description);

    if (hasInjectionPattern(tx.description)) {
      warnings.push(
        `Sumnjiv opis transakcije (moguća injekcija): "${cleanedDescription.slice(0, 80)}".`,
      );
    }

    accepted.push({ ...tx, description: cleanedDescription });
  }

  return { transactions: accepted, warnings, filteredCount };
}
