// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BudgetsWidget } from './budgets-widget';
import type { BudgetWithProgress } from '@/lib/queries/budgets';

function makeBudget(
  overrides: Partial<BudgetWithProgress> & { id: string; name: string; progress: number },
): BudgetWithProgress {
  const amount = overrides.amountCents ?? 100_000n;
  const spent =
    overrides.spentCents ?? (amount * BigInt(Math.round(overrides.progress * 100))) / 100n;
  return {
    id: overrides.id,
    amountCents: amount,
    spentCents: spent,
    currency: overrides.currency ?? 'BAM',
    period: overrides.period ?? 'monthly',
    active: overrides.active ?? true,
    rollover: overrides.rollover ?? false,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
    progress: overrides.progress,
    daysLeft: overrides.daysLeft ?? 12,
    category: overrides.category ?? {
      id: `cat-${overrides.id}`,
      name: overrides.name,
      slug: overrides.name.toLowerCase().replace(/\s+/gu, '-'),
      icon: '🍔',
      color: null,
      kind: 'expense',
    },
  };
}

async function renderWidget(budgets: BudgetWithProgress[]) {
  const ui = await BudgetsWidget({ budgetsPromise: Promise.resolve(budgets) });
  render(ui);
}

describe('BudgetsWidget', () => {
  it('renders the "Svi budžeti" header CTA link to /budzeti', async () => {
    await renderWidget([]);
    const sviBudzeti = screen.getByRole('link', { name: /Svi budžeti/u });
    expect(sviBudzeti.getAttribute('href')).toBe('/budzeti');
  });

  it('shows empty state when no active budgets exist', async () => {
    await renderWidget([]);
    expect(screen.getByText(/Postavi prvi budžet/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Postavi budžet' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Top 3 budžeti' })).toBeNull();
  });

  it('shows empty state when only inactive budgets exist', async () => {
    await renderWidget([
      makeBudget({ id: '1', name: 'Hrana', progress: 0.5, active: false }),
      makeBudget({ id: '2', name: 'Gorivo', progress: 0.8, active: false }),
    ]);
    expect(screen.getByText(/Postavi prvi budžet/u)).toBeTruthy();
  });

  it('renders all budgets when there are 3 or fewer', async () => {
    await renderWidget([
      makeBudget({ id: '1', name: 'Hrana', progress: 0.3 }),
      makeBudget({ id: '2', name: 'Gorivo', progress: 0.6 }),
    ]);
    const list = screen.getByRole('list', { name: 'Top 3 budžeti' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Hrana')).toBeTruthy();
    expect(within(list).getByText('Gorivo')).toBeTruthy();
  });

  it('caps display at top 3 when more active budgets exist', async () => {
    await renderWidget([
      makeBudget({ id: '1', name: 'Niska', progress: 0.1 }),
      makeBudget({ id: '2', name: 'Srednja', progress: 0.5 }),
      makeBudget({ id: '3', name: 'Visoka', progress: 0.8 }),
      makeBudget({ id: '4', name: 'Maksimum', progress: 0.99 }),
      makeBudget({ id: '5', name: 'Premašen', progress: 1.2 }),
    ]);
    const list = screen.getByRole('list', { name: 'Top 3 budžeti' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('sorts active budgets by progress DESC (most-pressing first)', async () => {
    await renderWidget([
      makeBudget({ id: '1', name: 'Niska', progress: 0.2 }),
      makeBudget({ id: '2', name: 'Visoka', progress: 0.9 }),
      makeBudget({ id: '3', name: 'Srednja', progress: 0.5 }),
    ]);
    const items = screen.getAllByRole('listitem');
    // Each <li> contains the category name as its primary visible text;
    // the order of the children mirrors the sorted result.
    const names = items.map((li) => within(li).getByText(/Visoka|Srednja|Niska/u).textContent);
    expect(names).toEqual(['Visoka', 'Srednja', 'Niska']);
  });

  it('breaks progress ties by amount DESC (bigger budget wins ties)', async () => {
    await renderWidget([
      makeBudget({ id: '1', name: 'Mali', progress: 0.5, amountCents: 10_000n }),
      makeBudget({ id: '2', name: 'Veliki', progress: 0.5, amountCents: 200_000n }),
    ]);
    const items = screen.getAllByRole('listitem');
    const names = items.map((li) => within(li).getByText(/Mali|Veliki/u).textContent);
    expect(names).toEqual(['Veliki', 'Mali']);
  });

  it('shows "Premašen" label when a row is overrun', async () => {
    await renderWidget([
      makeBudget({
        id: '1',
        name: 'Hrana',
        progress: 1.3,
        spentCents: 130_000n,
        amountCents: 100_000n,
      }),
    ]);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Premašen')).toBeTruthy();
  });

  it('shows daysLeft when not overrun', async () => {
    await renderWidget([makeBudget({ id: '1', name: 'Hrana', progress: 0.5, daysLeft: 7 })]);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('7 dana')).toBeTruthy();
  });

  it('applies destructive palette for overrun rows', async () => {
    const { container } = render(
      await BudgetsWidget({
        budgetsPromise: Promise.resolve([makeBudget({ id: '1', name: 'Hrana', progress: 1.1 })]),
      }),
    );
    expect(container.querySelector('.ring-destructive\\/30')).toBeTruthy();
  });

  it('applies amber palette for warn-tier rows (70%–95%)', async () => {
    const { container } = render(
      await BudgetsWidget({
        budgetsPromise: Promise.resolve([makeBudget({ id: '1', name: 'Hrana', progress: 0.85 })]),
      }),
    );
    expect(container.querySelector('.ring-amber-500\\/30')).toBeTruthy();
  });

  it('applies emerald palette for safe-tier rows (<70%)', async () => {
    const { container } = render(
      await BudgetsWidget({
        budgetsPromise: Promise.resolve([makeBudget({ id: '1', name: 'Hrana', progress: 0.4 })]),
      }),
    );
    expect(container.querySelector('.ring-emerald-500\\/30')).toBeTruthy();
  });

  it('renders Svi budžeti link even when empty (discovery surface)', async () => {
    await renderWidget([]);
    expect(screen.getByRole('link', { name: /Svi budžeti/u }).getAttribute('href')).toBe(
      '/budzeti',
    );
  });
});
