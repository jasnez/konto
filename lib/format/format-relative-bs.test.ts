// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatRelativeBs } from './format-relative-bs';

const NOW = new Date('2026-05-04T12:00:00Z');

function ago(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe('formatRelativeBs', () => {
  it('returns "upravo" for sub-minute diffs', () => {
    expect(formatRelativeBs(ago(0), NOW)).toBe('upravo');
    expect(formatRelativeBs(ago(30), NOW)).toBe('upravo');
    expect(formatRelativeBs(ago(59), NOW)).toBe('upravo');
  });

  it('formats minutes with correct plural forms', () => {
    expect(formatRelativeBs(ago(60), NOW)).toBe('Prije 1 minutu');
    expect(formatRelativeBs(ago(60 * 2), NOW)).toBe('Prije 2 minute');
    expect(formatRelativeBs(ago(60 * 4), NOW)).toBe('Prije 4 minute');
    expect(formatRelativeBs(ago(60 * 5), NOW)).toBe('Prije 5 minuta');
    expect(formatRelativeBs(ago(60 * 11), NOW)).toBe('Prije 11 minuta');
    expect(formatRelativeBs(ago(60 * 21), NOW)).toBe('Prije 21 minutu'); // 21 % 10 === 1
    expect(formatRelativeBs(ago(60 * 22), NOW)).toBe('Prije 22 minute');
    expect(formatRelativeBs(ago(60 * 25), NOW)).toBe('Prije 25 minuta');
  });

  it('formats hours correctly', () => {
    expect(formatRelativeBs(ago(3600), NOW)).toBe('Prije 1 sat');
    expect(formatRelativeBs(ago(3600 * 2), NOW)).toBe('Prije 2 sata');
    expect(formatRelativeBs(ago(3600 * 5), NOW)).toBe('Prije 5 sati');
    // 23 % 10 = 3, 23 % 100 = 23 (not in [12,13,14]) → paucal form "sata"
    expect(formatRelativeBs(ago(3600 * 23), NOW)).toBe('Prije 23 sata');
  });

  it('formats days correctly', () => {
    expect(formatRelativeBs(ago(86400), NOW)).toBe('Prije 1 dan');
    expect(formatRelativeBs(ago(86400 * 2), NOW)).toBe('Prije 2 dana');
    expect(formatRelativeBs(ago(86400 * 6), NOW)).toBe('Prije 6 dana');
  });

  it('formats weeks (7-29 days)', () => {
    expect(formatRelativeBs(ago(86400 * 7), NOW)).toBe('Prije 1 sedmicu');
    expect(formatRelativeBs(ago(86400 * 14), NOW)).toBe('Prije 2 sedmice');
    expect(formatRelativeBs(ago(86400 * 28), NOW)).toBe('Prije 4 sedmice');
  });

  it('formats months (30-364 days)', () => {
    expect(formatRelativeBs(ago(86400 * 30), NOW)).toBe('Prije 1 mjesec');
    expect(formatRelativeBs(ago(86400 * 60), NOW)).toBe('Prije 2 mjeseca');
    expect(formatRelativeBs(ago(86400 * 180), NOW)).toBe('Prije 6 mjeseci');
  });

  it('formats years', () => {
    expect(formatRelativeBs(ago(86400 * 365), NOW)).toBe('Prije 1 godinu');
    expect(formatRelativeBs(ago(86400 * 730), NOW)).toBe('Prije 2 godine');
    expect(formatRelativeBs(ago(86400 * 365 * 5), NOW)).toBe('Prije 5 godina');
  });

  it('handles future-dated input', () => {
    const future = new Date(NOW.getTime() + 3600_000);
    expect(formatRelativeBs(future, NOW)).toBe('u budućnosti');
  });

  it('accepts string input', () => {
    expect(formatRelativeBs('2026-05-04T11:59:00Z', NOW)).toBe('Prije 1 minutu');
  });

  it('returns empty string for invalid input', () => {
    expect(formatRelativeBs('not-a-date', NOW)).toBe('');
  });
});
