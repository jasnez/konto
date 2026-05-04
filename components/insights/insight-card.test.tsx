import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InsightCard } from './insight-card';
import type { InsightRow } from '@/lib/queries/insights';

const BASE: InsightRow = {
  id: 'i-1',
  type: 'category_anomaly',
  severity: 'warning',
  title: 'Hrana viša 50%',
  body: '**Hrana** je u aprilu bila 50% viša.',
  actionUrl: '/transakcije?category=cat-1',
  metadata: {},
  validUntil: null,
  dismissedAt: null,
  createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago
};

describe('InsightCard', () => {
  it('renders title, type label, severity pill, and bold body', () => {
    render(<InsightCard insight={BASE} mode="active" />);
    expect(screen.getByText('Hrana viša 50%')).toBeInTheDocument();
    expect(screen.getByText('Anomalija kategorije')).toBeInTheDocument();
    expect(screen.getByText('Upozorenje')).toBeInTheDocument();
    // Bold from markdown
    const bold = screen.getByText('Hrana');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders "Otvori" link only when actionUrl is set', () => {
    const { rerender } = render(<InsightCard insight={BASE} mode="active" />);
    expect(screen.getByText('Otvori')).toBeInTheDocument();

    rerender(<InsightCard insight={{ ...BASE, actionUrl: null }} mode="active" />);
    expect(screen.queryByText('Otvori')).toBeNull();
  });

  it('shows dismiss X in active mode and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(<InsightCard insight={BASE} mode="active" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Skloni uvid'));
    expect(onDismiss).toHaveBeenCalledWith('i-1');
  });

  it('shows Vrati button in archived mode and calls onRestore', () => {
    const onRestore = vi.fn();
    render(
      <InsightCard
        insight={{ ...BASE, dismissedAt: new Date().toISOString() }}
        mode="archived"
        onRestore={onRestore}
      />,
    );
    fireEvent.click(screen.getByLabelText('Vrati uvid'));
    expect(onRestore).toHaveBeenCalledWith('i-1');
  });

  it('uses correct severity styling (data-severity attribute)', () => {
    const { rerender } = render(<InsightCard insight={BASE} mode="active" />);
    expect(screen.getByTestId('insight-card')).toHaveAttribute('data-severity', 'warning');

    rerender(<InsightCard insight={{ ...BASE, severity: 'alert' }} mode="active" />);
    expect(screen.getByTestId('insight-card')).toHaveAttribute('data-severity', 'alert');
    expect(screen.getByText('Hitno')).toBeInTheDocument();
  });

  it('renders relative time', () => {
    render(<InsightCard insight={BASE} mode="active" />);
    expect(screen.getByText(/Prije 1 sat/)).toBeInTheDocument();
  });
});
