import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UvidiClient } from './uvidi-client';
import type { InsightRow } from '@/lib/queries/insights';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/app/(app)/uvidi/actions', () => ({
  dismissInsight: vi.fn(),
  undismissInsight: vi.fn(),
  regenerateInsights: vi.fn(),
}));

const NOW_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const ALERT: InsightRow = {
  id: 'i-alert',
  type: 'budget_breach',
  severity: 'alert',
  title: 'Probit ćeš budžet',
  body: 'Hrana 50 KM iznad.',
  actionUrl: '/budzeti',
  metadata: {},
  validUntil: null,
  dismissedAt: null,
  createdAt: NOW_ISO,
};

const INFO: InsightRow = {
  id: 'i-info',
  type: 'savings_opportunity',
  severity: 'info',
  title: 'Bravo ušteda',
  body: 'Manje potrošeno.',
  actionUrl: null,
  metadata: {},
  validUntil: null,
  dismissedAt: null,
  createdAt: NOW_ISO,
};

const ARCHIVED: InsightRow = {
  ...INFO,
  id: 'i-arch',
  title: 'Arhiviran info',
  dismissedAt: NOW_ISO,
};

describe('UvidiClient', () => {
  it('renders both tabs with counts', () => {
    render(<UvidiClient active={[ALERT, INFO]} archived={[ARCHIVED]} isDev={false} />);
    expect(screen.getByText('Aktivni')).toBeInTheDocument();
    expect(screen.getByText('Arhiva')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // active count
    expect(screen.getByText('1')).toBeInTheDocument(); // archived count
  });

  it('shows active insights by default', () => {
    render(<UvidiClient active={[ALERT, INFO]} archived={[ARCHIVED]} isDev={false} />);
    expect(screen.getByText('Probit ćeš budžet')).toBeInTheDocument();
    expect(screen.getByText('Bravo ušteda')).toBeInTheDocument();
    expect(screen.queryByText('Arhiviran info')).toBeNull();
  });

  it('switches to archived tab', async () => {
    const user = userEvent.setup();
    render(<UvidiClient active={[ALERT]} archived={[ARCHIVED]} isDev={false} />);
    // Radix Tabs respond to keyboard/pointer events from userEvent more
    // reliably than synthetic fireEvent.click in jsdom.
    await user.click(screen.getByRole('tab', { name: /Arhiva/ }));
    expect(screen.getByText('Arhiviran info')).toBeInTheDocument();
  });

  it('filters by severity', () => {
    render(<UvidiClient active={[ALERT, INFO]} archived={[]} isDev={false} />);
    // "Hitno" appears both as a chip filter button AND as the severity pill on
    // the alert card. Click specifically the filter button.
    fireEvent.click(screen.getByRole('button', { name: 'Hitno' }));
    expect(screen.getByText('Probit ćeš budžet')).toBeInTheDocument();
    expect(screen.queryByText('Bravo ušteda')).toBeNull();
  });

  it('filters by type', () => {
    render(<UvidiClient active={[ALERT, INFO]} archived={[]} isDev={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prijetnja budžetu' }));
    expect(screen.getByText('Probit ćeš budžet')).toBeInTheDocument();
    expect(screen.queryByText('Bravo ušteda')).toBeNull();
  });

  it('shows "Poništi filtere" button when any filter is active', () => {
    render(<UvidiClient active={[ALERT, INFO]} archived={[]} isDev={false} />);
    expect(screen.queryByText('Poništi filtere')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hitno' }));
    expect(screen.getByText('Poništi filtere')).toBeInTheDocument();
  });

  it('hides dev "Generiši ponovo" when isDev=false', () => {
    render(<UvidiClient active={[]} archived={[]} isDev={false} />);
    expect(screen.queryByText(/Generiši ponovo/)).toBeNull();
  });

  it('shows dev "Generiši ponovo" when isDev=true', () => {
    render(<UvidiClient active={[]} archived={[]} isDev={true} />);
    expect(screen.getByText(/Generiši ponovo/)).toBeInTheDocument();
  });

  it('shows empty state when active list is empty', () => {
    render(<UvidiClient active={[]} archived={[ARCHIVED]} isDev={false} />);
    expect(screen.getByText(/Nema aktivnih uvida/)).toBeInTheDocument();
  });

  it('shows filter-specific empty message when filtered to nothing', () => {
    render(<UvidiClient active={[ALERT]} archived={[]} isDev={false} />);
    // type filter "savings_opportunity" — won't match the alert (budget_breach)
    fireEvent.click(screen.getByRole('button', { name: 'Ušteda' }));
    expect(screen.getByText(/Probaj poništiti filtere/)).toBeInTheDocument();
  });
});
