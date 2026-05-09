import { describe, expect, it } from 'vitest';
import { assessReceiptDate, describePlausibility } from '@/lib/receipt/date-plausibility';

describe('assessReceiptDate', () => {
  it('returns ok for today', () => {
    expect(assessReceiptDate('2026-05-09', '2026-05-09')).toEqual({ kind: 'ok' });
  });

  it('returns ok for a few-day-old receipt (within tolerance)', () => {
    expect(assessReceiptDate('2026-05-01', '2026-05-09')).toEqual({ kind: 'ok' });
  });

  it('returns ok at the exact 60-day past boundary', () => {
    // 2026-03-10 is 60 days before 2026-05-09 — boundary is inclusive of "ok".
    expect(assessReceiptDate('2026-03-10', '2026-05-09')).toEqual({ kind: 'ok' });
  });

  it('flags `past` once we cross 60 days', () => {
    // 2026-03-09 is 61 days before 2026-05-09.
    expect(assessReceiptDate('2026-03-09', '2026-05-09')).toEqual({ kind: 'past', days: 61 });
  });

  it('flags the OCR misread case (years off — regression for audit 2026-05-08)', () => {
    // The exact scenario that broke the user's flow: scan on 2026-05-09,
    // Gemini extracted 2008-05-26.
    const result = assessReceiptDate('2008-05-26', '2026-05-09');
    expect(result.kind).toBe('past');
    if (result.kind === 'past') {
      // ~18 years; let the threshold-based logic translate that to a
      // human label via describePlausibility.
      expect(result.days).toBeGreaterThan(6500);
    }
  });

  it('flags `future` when date is more than 1 day ahead', () => {
    expect(assessReceiptDate('2026-05-11', '2026-05-09')).toEqual({ kind: 'future', days: 2 });
  });

  it('tolerates 1-day-future drift (TZ skew)', () => {
    // Server clock might be a few hours behind the user; allow ±1 day.
    expect(assessReceiptDate('2026-05-10', '2026-05-09')).toEqual({ kind: 'ok' });
  });

  it('returns invalid for malformed inputs', () => {
    expect(assessReceiptDate('not-a-date', '2026-05-09')).toEqual({ kind: 'invalid' });
    expect(assessReceiptDate('2026-05-09', 'not-a-date')).toEqual({ kind: 'invalid' });
    expect(assessReceiptDate('', '2026-05-09')).toEqual({ kind: 'invalid' });
    expect(assessReceiptDate('2026/05/09', '2026-05-09')).toEqual({ kind: 'invalid' });
  });
});

describe('describePlausibility', () => {
  it('returns null for ok and invalid (no banner to render)', () => {
    expect(describePlausibility({ kind: 'ok' }, '09.05.2026.')).toBeNull();
    expect(describePlausibility({ kind: 'invalid' }, '09.05.2026.')).toBeNull();
  });

  it('humanises years for very old past dates', () => {
    // 18 years × 365 days/year ≈ 6570
    const copy = describePlausibility({ kind: 'past', days: 6574 }, '26.05.2008.');
    expect(copy).toContain('26.05.2008.');
    expect(copy).toContain('18 godina');
    expect(copy).toContain('OCR');
  });

  it('uses singular `godinu` for exactly one year', () => {
    const copy = describePlausibility({ kind: 'past', days: 365 }, '09.05.2025.');
    expect(copy).toContain('1 godinu');
  });

  it('uses `godine` for 2-4 years (Bosnian plural rule)', () => {
    const copy = describePlausibility({ kind: 'past', days: 365 * 3 }, '09.05.2023.');
    expect(copy).toContain('3 godine');
  });

  it('uses days unit for 60-365 day window', () => {
    const copy = describePlausibility({ kind: 'past', days: 90 }, '09.02.2026.');
    expect(copy).toContain('90 dana');
    expect(copy).not.toContain('godina');
  });

  it('renders future case', () => {
    const copy = describePlausibility({ kind: 'future', days: 5 }, '14.05.2026.');
    expect(copy).toContain('budućnosti');
    expect(copy).toContain('5 dana');
  });
});
