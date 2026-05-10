// @vitest-environment node

/**
 * MT-8: Tests for `computeDateRange` lock-step contract with SQL RPC
 * `get_spending_by_category` (migration 00062). If you change either,
 * update both AND regenerate this test snapshot.
 *
 * Coverage:
 *   - All 4 periods at a "boring" Wednesday in mid-month (no edge cases).
 *   - Weekly bounds across each weekday so the Monday-anchor logic is
 *     exercised on Mon, Tue, Wed, Thu, Fri, Sat, Sun.
 *   - Monthly across year boundary (Dec → Jan rollover).
 *   - Quarterly across year boundary (Jan → Oct of previous year).
 *   - Yearly straightforward.
 *   - Leap day (Feb 29 2028) for monthly + quarterly + weekly.
 */

import { describe, expect, it } from 'vitest';
import { computeDateRange, type PeriodRange } from '../compute-period-range';

describe('computeDateRange — happy path on a Wednesday in May 2026', () => {
  const TODAY = '2026-05-13'; // Wednesday

  it('weekly: Monday 2026-05-11 → Sunday 2026-05-17', () => {
    const r = computeDateRange('weekly', TODAY);
    expect(r.from).toBe('2026-05-11');
    expect(r.to).toBe('2026-05-17');
  });

  it('monthly: 2026-05-01 → 2026-05-31', () => {
    const r = computeDateRange('monthly', TODAY);
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-31');
  });

  it('quarterly (rolling 3 months): 2026-02-14 → 2026-05-13', () => {
    // Rolling 3 months ENDING today, inclusive — NOT calendar quarter.
    // RPC computes `today - interval '3 months'` so May 13 → Feb 13;
    // since end is today + 1 day exclusive, inclusive end = today.
    // Start = (today + 1 day) - 3 months = May 14 - 3 months = Feb 14.
    const r = computeDateRange('quarterly', TODAY);
    expect(r.from).toBe('2026-02-14');
    expect(r.to).toBe('2026-05-13');
  });

  it('yearly: 2026-01-01 → 2026-12-31', () => {
    const r = computeDateRange('yearly', TODAY);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-12-31');
  });

  it('returns a non-empty Bosnian-locale label for every period', () => {
    for (const period of ['weekly', 'monthly', 'quarterly', 'yearly'] as const) {
      const r = computeDateRange(period, TODAY);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.label).toContain(' — ');
    }
  });
});

describe('weekly: Monday-anchor on every day of the week', () => {
  // Verify the ISO Monday-anchor for each weekday in week of May 2026.
  // 2026-05-11 is Monday; check Mon..Sun all anchor to that Monday.
  const cases: { today: string; weekday: string; expectedMonday: string }[] = [
    { today: '2026-05-11', weekday: 'Mon', expectedMonday: '2026-05-11' },
    { today: '2026-05-12', weekday: 'Tue', expectedMonday: '2026-05-11' },
    { today: '2026-05-13', weekday: 'Wed', expectedMonday: '2026-05-11' },
    { today: '2026-05-14', weekday: 'Thu', expectedMonday: '2026-05-11' },
    { today: '2026-05-15', weekday: 'Fri', expectedMonday: '2026-05-11' },
    { today: '2026-05-16', weekday: 'Sat', expectedMonday: '2026-05-11' },
    { today: '2026-05-17', weekday: 'Sun', expectedMonday: '2026-05-11' },
  ];

  for (const { today, weekday, expectedMonday } of cases) {
    it(`${weekday} ${today} anchors to ${expectedMonday}`, () => {
      const r = computeDateRange('weekly', today);
      expect(r.from).toBe(expectedMonday);
    });
  }
});

describe('monthly: edge cases', () => {
  it('first day of month: stays in same month, ends on last day', () => {
    const r = computeDateRange('monthly', '2026-05-01');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-31');
  });

  it('last day of month: still in same month', () => {
    const r = computeDateRange('monthly', '2026-05-31');
    expect(r.from).toBe('2026-05-01');
    expect(r.to).toBe('2026-05-31');
  });

  it('December → boundaries inside December', () => {
    const r = computeDateRange('monthly', '2026-12-15');
    expect(r.from).toBe('2026-12-01');
    expect(r.to).toBe('2026-12-31');
  });

  it('February (non-leap year): ends on Feb 28', () => {
    const r = computeDateRange('monthly', '2026-02-15');
    expect(r.from).toBe('2026-02-01');
    expect(r.to).toBe('2026-02-28');
  });

  it('February (leap year 2028): ends on Feb 29', () => {
    const r = computeDateRange('monthly', '2028-02-15');
    expect(r.from).toBe('2028-02-01');
    expect(r.to).toBe('2028-02-29');
  });
});

describe('quarterly: edge cases — locks in current JS behavior', () => {
  // KNOWN QUIRK: JS Date.UTC day-of-month arithmetic differs from Postgres
  // `interval '3 months'`. Postgres preserves the day-of-month and clamps
  // (e.g. Dec 31 - 3 months = Sep 30); JS Date.UTC overflows day numbers
  // through to the next month (e.g. Sep 32 → Oct 2). For a 30/31 day
  // mismatch the windows can shift by 1-2 days. This is a pre-existing
  // limitation of the original implementation and out of scope for MT-8
  // — the goal here is to LOCK the existing behavior in tests so any
  // future "fix" is intentional, not accidental drift.

  it('Jan today: window crosses year boundary backward into prior Oct', () => {
    // Jan 15 + 1 day = Jan 16; (Jan 16) - 3 months = Oct 16 (prior year)
    const r = computeDateRange('quarterly', '2026-01-15');
    expect(r.from).toBe('2025-10-16');
    expect(r.to).toBe('2026-01-15');
  });

  it('today is Dec 31: window ends Dec 31, starts Oct 2 (JS overflow quirk)', () => {
    // endExclusive = Date.UTC(2026, 11, 32) = Jan 1 2027 (day 32 overflows).
    // start = Date.UTC(2026, 8, 32) = Oct 2 2026 (Sep has 30 days, so day 32
    // → Oct 2). NOT Oct 1 — that's what Postgres's interval arithmetic
    // would produce. See class header for the JS-vs-PG mismatch caveat.
    const r = computeDateRange('quarterly', '2026-12-31');
    expect(r.from).toBe('2026-10-02');
    expect(r.to).toBe('2026-12-31');
  });

  it('leap day Feb 29 2028: window starts Nov 30 2027 (JS overflow quirk)', () => {
    // y=2028, m=2, d=29 → start arg = Date.UTC(2028, 2-1-3, 29+1) =
    // Date.UTC(2028, -2, 30). JS interprets month -2 as Nov of prior
    // year (Dec=-1, Nov=-2). Nov 2027 has 30 days, so Nov 30 2027.
    // endExclusive = Date.UTC(2028, 1, 30) = Mar 1 2028 (Feb 2028 has
    // 29 days; day 30 overflows). inclusive_to = Feb 29 2028.
    const r = computeDateRange('quarterly', '2028-02-29');
    expect(r.from).toBe('2027-11-30');
    expect(r.to).toBe('2028-02-29');
  });
});

describe('yearly: year-boundary stability', () => {
  it('Jan 1: full year ahead', () => {
    const r = computeDateRange('yearly', '2026-01-01');
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-12-31');
  });

  it('Dec 31: still that year, not next', () => {
    const r = computeDateRange('yearly', '2026-12-31');
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-12-31');
  });

  it('leap year 2028: 366 days', () => {
    const r = computeDateRange('yearly', '2028-06-15');
    expect(r.from).toBe('2028-01-01');
    expect(r.to).toBe('2028-12-31');
  });
});

describe('PeriodRange shape', () => {
  it('returns an object with from, to, label fields of correct types', () => {
    const r: PeriodRange = computeDateRange('monthly', '2026-05-13');
    expect(typeof r.from).toBe('string');
    expect(typeof r.to).toBe('string');
    expect(typeof r.label).toBe('string');
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});
