// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  computeTrend,
  FALLBACK_PALETTE,
  pickColor,
  PulseDonutChart,
  type SerializedCategorySpend,
} from './pulse-donut-chart';

/**
 * Recharts uses `ResizeObserver` + DOM measurements that jsdom doesn't
 * fully implement; PieChart often renders nothing useful in jsdom. We
 * therefore mock `recharts` to plain DOM nodes for these component
 * tests — chart fidelity is covered by Playwright at the browser level.
 */
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rc-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rc-pie">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rc-pie-inner">{children}</div>
  ),
  Cell: () => <div data-testid="rc-cell" />,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rc-line">{children}</div>
  ),
  Line: () => <div data-testid="rc-line-inner" />,
}));

const ROW: SerializedCategorySpend = {
  categoryId: 'cat-1',
  name: 'Hrana',
  icon: '🍔',
  color: '#10b981',
  slug: 'hrana',
  amountCents: '12500',
  prevAmountCents: '10000',
  monthlyHistory: [
    '0',
    '0',
    '0',
    '500',
    '1000',
    '2000',
    '3000',
    '4000',
    '6000',
    '8000',
    '10000',
    '12500',
  ],
};

const ROW_DOWN: SerializedCategorySpend = {
  ...ROW,
  categoryId: 'cat-2',
  name: 'Prevoz',
  icon: '🚗',
  slug: 'prevoz',
  amountCents: '5000',
  prevAmountCents: '8000',
};

const ROW_NEW: SerializedCategorySpend = {
  ...ROW,
  categoryId: 'cat-3',
  name: 'Putovanja',
  icon: '✈️',
  slug: 'putovanja',
  amountCents: '40000',
  prevAmountCents: '0',
};

const ROW_NULL_BUCKET: SerializedCategorySpend = {
  ...ROW,
  categoryId: null,
  name: 'Nerazvrstano',
  icon: '📦',
  slug: '__uncategorized__',
};

describe('computeTrend', () => {
  it('returns up + percent for an increase', () => {
    expect(computeTrend(1500n, 1000n)).toEqual({ kind: 'up', percent: 50 });
  });
  it('returns down + percent for a decrease', () => {
    expect(computeTrend(800n, 1000n)).toEqual({ kind: 'down', percent: 20 });
  });
  it('returns new when previous was 0 and current is positive', () => {
    expect(computeTrend(500n, 0n)).toEqual({ kind: 'new', percent: 0 });
  });
  it('returns flat when both are 0', () => {
    expect(computeTrend(0n, 0n)).toEqual({ kind: 'flat', percent: 0 });
  });
  it('returns flat when current equals previous', () => {
    expect(computeTrend(1000n, 1000n)).toEqual({ kind: 'flat', percent: 0 });
  });
  it('caps absurd percent at 999', () => {
    expect(computeTrend(1_000_000n, 1n).percent).toBe(999);
  });
});

describe('pickColor', () => {
  it('uses category color when present', () => {
    expect(pickColor({ ...ROW, color: '#abcdef' }, 0)).toBe('#abcdef');
  });
  it('falls back to palette when color is null', () => {
    expect(pickColor({ ...ROW, color: null }, 0)).toBe(FALLBACK_PALETTE[0]);
  });
  it('rotates through palette on null colors', () => {
    expect(pickColor({ ...ROW, color: null }, FALLBACK_PALETTE.length)).toBe(FALLBACK_PALETTE[0]);
  });
});

describe('PulseDonutChart', () => {
  it('renders one row per category and shows total in the centre', () => {
    render(
      <PulseDonutChart data={[ROW, ROW_DOWN]} currency="BAM" totalCents="17500" variant="widget" />,
    );
    expect(screen.getByText('Hrana')).toBeTruthy();
    expect(screen.getByText('Prevoz')).toBeTruthy();
    // Centre default = total in BAM.
    expect(screen.getByText('Ukupno')).toBeTruthy();
  });

  it('renders an "novo" pill when prev was 0 and current > 0', () => {
    render(<PulseDonutChart data={[ROW_NEW]} currency="BAM" totalCents="40000" variant="widget" />);
    expect(screen.getByText('novo')).toBeTruthy();
  });

  it('renders an up arrow with red text when spending grew', () => {
    render(<PulseDonutChart data={[ROW]} currency="BAM" totalCents="12500" variant="widget" />);
    const trend = screen.getByLabelText(/poraslo za 25 posto/i);
    expect(trend.className).toContain('text-destructive');
  });

  it('renders a down arrow with emerald text when spending fell', () => {
    render(<PulseDonutChart data={[ROW_DOWN]} currency="BAM" totalCents="5000" variant="widget" />);
    const trend = screen.getByLabelText(/smanjeno za 37 posto/i);
    expect(trend.className).toContain('emerald');
  });

  it('emits a drill-down link on the page variant when categoryId is set', () => {
    render(
      <PulseDonutChart
        data={[ROW]}
        currency="BAM"
        totalCents="12500"
        variant="page"
        drillDownDateRange={{ from: '2026-05-01', to: '2026-06-01' }}
      />,
    );
    const link = screen.getByRole('link', { name: /Hrana/ });
    expect(link.getAttribute('href')).toBe(
      '/transakcije?category=cat-1&from=2026-05-01&to=2026-06-01',
    );
  });

  it('falls back to a button (no drill-down) for the uncategorised bucket on the page variant', () => {
    render(
      <PulseDonutChart
        data={[ROW_NULL_BUCKET]}
        currency="BAM"
        totalCents="12500"
        variant="page"
        drillDownDateRange={{ from: '2026-05-01', to: '2026-06-01' }}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: /Nerazvrstano/ })).toBeTruthy();
  });

  it('renders no drill-down link on the widget variant', () => {
    render(<PulseDonutChart data={[ROW]} currency="BAM" totalCents="12500" variant="widget" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: /Hrana/ })).toBeTruthy();
  });
});
