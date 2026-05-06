// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendingByCategoryWidget } from './spending-by-category-widget';
import type { CategorySpendRow } from '@/lib/queries/spending-by-category';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
}));

function row(overrides: Partial<CategorySpendRow> = {}): CategorySpendRow {
  return {
    categoryId: 'cat-' + (overrides.slug ?? 'x'),
    name: 'Hrana',
    icon: '🍔',
    color: '#10b981',
    slug: 'hrana',
    amountCents: 12500n,
    prevAmountCents: 10000n,
    monthlyHistory: Array.from({ length: 12 }, () => 0n),
    ...overrides,
  };
}

describe('SpendingByCategoryWidget', () => {
  it('renders the empty state when there are no expense categories', async () => {
    const ui = await SpendingByCategoryWidget({
      spendingPromise: Promise.resolve([]),
      baseCurrency: 'BAM',
      totalCents: 0n,
    });
    render(ui);
    expect(screen.getByText(/Još nema potrošnje/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Dodaj transakciju/i })).toBeTruthy();
  });

  it('renders title + "Vidi sve" link to /potrosnja', async () => {
    const ui = await SpendingByCategoryWidget({
      spendingPromise: Promise.resolve([row({ slug: 'hrana' })]),
      baseCurrency: 'BAM',
      totalCents: 12500n,
    });
    render(ui);
    expect(screen.getByText('Potrošnja po kategorijama')).toBeTruthy();
    const see = screen.getByRole('link', { name: /Vidi sve/i });
    expect(see.getAttribute('href')).toBe('/potrosnja');
  });

  it('hides the uncategorised bucket (categoryId === null) from the top 5', async () => {
    const ui = await SpendingByCategoryWidget({
      spendingPromise: Promise.resolve([
        row({ slug: 'hrana', name: 'Hrana' }),
        row({ slug: 'nerazvrstano', name: 'Nerazvrstano', categoryId: null }),
      ]),
      baseCurrency: 'BAM',
      totalCents: 25000n,
    });
    render(ui);
    expect(screen.getByText('Hrana')).toBeTruthy();
    expect(screen.queryByText('Nerazvrstano')).toBeNull();
  });

  it('caps to top 5 when more rows arrive', async () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      row({ slug: `cat-${String(i)}`, name: `Kategorija ${String(i)}` }),
    );
    const ui = await SpendingByCategoryWidget({
      spendingPromise: Promise.resolve(eight),
      baseCurrency: 'BAM',
      totalCents: 100000n,
    });
    render(ui);
    expect(screen.getByText('Kategorija 0')).toBeTruthy();
    expect(screen.getByText('Kategorija 4')).toBeTruthy();
    // 6th-onwards must be sliced off.
    expect(screen.queryByText('Kategorija 5')).toBeNull();
    expect(screen.queryByText('Kategorija 7')).toBeNull();
  });
});
