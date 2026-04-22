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
});
