// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { budgetBreachPredictor } from '../detectors/budget-breach';
import { freshIds, makeBudget, makeContext } from './fixtures';

describe('budgetBreachPredictor', () => {
  beforeEach(() => {
    freshIds();
  });

  it('emits warning when projected ~120% of budget on monthly day 15', () => {
    // Today: 2026-05-15 → 15 days into a 31-day month.
    // Budget: 60,000 cents (600 KM). Spent so far: 30,000 (300 KM).
    // Projection = 30000 × 31/15 = 62,000 → ratio 1.0333 → warning.
    const today = new Date('2026-05-15T12:00:00Z');
    const budget = makeBudget({
      id: 'bud-hrana',
      amountCents: 60000n,
      spentCents: 30000n,
      period: 'monthly',
      categoryName: 'Hrana',
    });
    const ctx = makeContext({ today, budgets: [budget] });
    const out = budgetBreachPredictor.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].dedupKey).toMatch(/^budget_breach:bud-hrana:2026-05-01$/);
  });

  it('emits alert when projected > 120% of budget', () => {
    const today = new Date('2026-05-15T12:00:00Z');
    const budget = makeBudget({
      id: 'bud-hrana',
      amountCents: 60000n,
      spentCents: 50000n, // 500 KM in 15 days → projection ~103,333 → ratio 1.72
      period: 'monthly',
      categoryName: 'Hrana',
    });
    const ctx = makeContext({ today, budgets: [budget] });
    const out = budgetBreachPredictor.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('alert');
  });

  it('skips when daysElapsed < 7 for monthly', () => {
    const today = new Date('2026-05-05T12:00:00Z'); // day 5
    const budget = makeBudget({
      amountCents: 60000n,
      spentCents: 60000n,
      period: 'monthly',
    });
    const ctx = makeContext({ today, budgets: [budget] });
    expect(budgetBreachPredictor.run(ctx)).toHaveLength(0);
  });

  it('skips when daysElapsed < 3 for weekly', () => {
    // Monday 2026-05-04 → daysElapsed = 1
    const today = new Date('2026-05-04T12:00:00Z');
    const budget = makeBudget({
      amountCents: 60000n,
      spentCents: 60000n,
      period: 'weekly',
    });
    const ctx = makeContext({ today, budgets: [budget] });
    expect(budgetBreachPredictor.run(ctx)).toHaveLength(0);
  });

  it('skips when projection is at or below 100%', () => {
    const today = new Date('2026-05-15T12:00:00Z');
    const budget = makeBudget({
      amountCents: 100000n,
      spentCents: 30000n, // 30000×31/15 = 62000 → 0.62
      period: 'monthly',
    });
    const ctx = makeContext({ today, budgets: [budget] });
    expect(budgetBreachPredictor.run(ctx)).toHaveLength(0);
  });

  it('skips inactive budgets', () => {
    const today = new Date('2026-05-15T12:00:00Z');
    const budget = makeBudget({
      amountCents: 50000n,
      spentCents: 100000n,
      period: 'monthly',
      active: false,
    });
    const ctx = makeContext({ today, budgets: [budget] });
    expect(budgetBreachPredictor.run(ctx)).toHaveLength(0);
  });
});
