import { describe, it, expect } from 'vitest';
import { formatWeekdayInitial } from './date-picker';

/** UTC-only Date helper so tests don't depend on the runner's local timezone. */
function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

describe('formatWeekdayInitial — single capital letter for bs locale', () => {
  // Anchor on a known week so each weekday has a stable date:
  // 2026-01-05 = Monday, 2026-01-06 = Tuesday, ..., 2026-01-11 = Sunday.
  const cases: { date: Date; expected: string }[] = [
    { date: utcDate(2026, 0, 5), expected: 'P' }, // Ponedjeljak
    { date: utcDate(2026, 0, 6), expected: 'U' }, // Utorak
    { date: utcDate(2026, 0, 7), expected: 'S' }, // Srijeda
    { date: utcDate(2026, 0, 8), expected: 'Č' }, // Četvrtak
    { date: utcDate(2026, 0, 9), expected: 'P' }, // Petak
    { date: utcDate(2026, 0, 10), expected: 'S' }, // Subota
    { date: utcDate(2026, 0, 11), expected: 'N' }, // Nedjelja
  ];

  it.each(cases)('returns "$expected" for the weekday containing $date', ({ date, expected }) => {
    expect(formatWeekdayInitial(date)).toBe(expected);
  });

  it('always returns exactly one character', () => {
    cases.forEach(({ date }) => {
      expect(formatWeekdayInitial(date)).toHaveLength(1);
    });
  });

  it('always returns an uppercase character', () => {
    cases.forEach(({ date }) => {
      const result = formatWeekdayInitial(date);
      expect(result).toBe(result.toUpperCase());
    });
  });
});
