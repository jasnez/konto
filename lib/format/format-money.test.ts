import { describe, it, expect } from 'vitest';
import { formatMoney } from './format-money';

describe('formatMoney', () => {
  it('formats BAM with KM and bs locale', () => {
    expect(formatMoney(1250n, 'BAM', 'bs-BA')).toMatch(/12,50/);
    expect(formatMoney(1250n, 'BAM', 'bs-BA')).toContain('KM');
  });

  it('hides currency label when showCurrency: false', () => {
    expect(formatMoney(1250n, 'BAM', 'bs-BA', { showCurrency: false })).toBe('12,50');
  });

  it('uses ISO code for non-BAM', () => {
    const s = formatMoney(99n, 'EUR', 'bs-BA');
    expect(s).toMatch(/0,99/);
    expect(s).toContain('EUR');
  });

  it('formats negative with unicode minus', () => {
    const s = formatMoney(-50n, 'BAM', 'bs-BA', { showCurrency: false });
    expect(s[0]).toBe('−');
  });

  it('uses period thousands + comma decimal for bs-BA', () => {
    expect(formatMoney(123456789n, 'BAM', 'bs-BA', { showCurrency: false })).toBe('1.234.567,89');
  });

  it('uses comma thousands + period decimal for en-US', () => {
    expect(formatMoney(123456789n, 'USD', 'en-US', { showCurrency: false })).toBe('1,234,567.89');
  });

  it('handles zero', () => {
    expect(formatMoney(0n, 'BAM', 'bs-BA', { showCurrency: false })).toBe('0,00');
  });

  it('handles single-digit fractional padding', () => {
    expect(formatMoney(105n, 'BAM', 'bs-BA', { showCurrency: false })).toBe('1,05');
  });

  it('produces deterministic output independent of host ICU build', () => {
    // Manual formatting must not depend on Intl.NumberFormat — this is the
    // core invariant that prevents SSR/CSR hydration mismatches.
    const a = formatMoney(-300000n, 'BAM', 'bs-BA');
    expect(a).toBe('−3.000,00 KM');
  });

  it('treats any en-* locale as English number format', () => {
    expect(formatMoney(123456n, 'GBP', 'en-GB', { showCurrency: false })).toBe('1,234.56');
    expect(formatMoney(123456n, 'CAD', 'en-CA', { showCurrency: false })).toBe('1,234.56');
    expect(formatMoney(123456n, 'AUD', 'en-AU', { showCurrency: false })).toBe('1,234.56');
  });
});
