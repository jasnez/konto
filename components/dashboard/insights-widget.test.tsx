import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InsightsWidget } from './insights-widget';
import type { InsightRow } from '@/lib/queries/insights';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// Server Actions can't actually run in jsdom; the widget never invokes them
// in tests below (we don't click dismiss). Stub the module to prevent the
// 'use server' import resolving against the real Server Action.
vi.mock('@/app/(app)/uvidi/actions', () => ({
  dismissInsight: vi.fn(),
  undismissInsight: vi.fn(),
}));

const NOW_ISO = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago

const ITEMS: InsightRow[] = [
  {
    id: 'i-alert',
    type: 'budget_breach',
    severity: 'alert',
    title: 'Probit ćeš budžet: Hrana',
    body: '**Hrana** budžet bit će probijen za 50 KM.',
    actionUrl: '/budzeti',
    metadata: {},
    validUntil: null,
    dismissedAt: null,
    createdAt: NOW_ISO,
  },
  {
    id: 'i-warn',
    type: 'category_anomaly',
    severity: 'warning',
    title: 'Hrana viša 50%',
    body: '**Hrana** je u aprilu bila 50% viša.',
    actionUrl: '/transakcije',
    metadata: {},
    validUntil: null,
    dismissedAt: null,
    createdAt: NOW_ISO,
  },
];

describe('InsightsWidget', () => {
  it('renders the title and "Svi uvidi" link', async () => {
    const ui = await InsightsWidget({ insightsPromise: Promise.resolve(ITEMS) });
    render(ui);
    expect(screen.getByText('Uvidi')).toBeInTheDocument();
    expect(screen.getByText('Svi uvidi')).toBeInTheDocument();
  });

  it('renders rows for each insight (titles + type labels)', async () => {
    const ui = await InsightsWidget({ insightsPromise: Promise.resolve(ITEMS) });
    render(ui);
    expect(screen.getByText('Probit ćeš budžet: Hrana')).toBeInTheDocument();
    expect(screen.getByText('Hrana viša 50%')).toBeInTheDocument();
    expect(screen.getByText('Prijetnja budžetu')).toBeInTheDocument();
  });

  it('strips **bold** markup from the row preview body', async () => {
    const ui = await InsightsWidget({ insightsPromise: Promise.resolve(ITEMS) });
    render(ui);
    // No literal "**" in the preview text
    expect(screen.queryByText(/\*\*/)).toBeNull();
    // Stripped content present
    expect(screen.getByText(/Hrana budžet bit će probijen/)).toBeInTheDocument();
  });

  it('renders the empty state when no insights', async () => {
    const ui = await InsightsWidget({ insightsPromise: Promise.resolve([]) });
    render(ui);
    expect(screen.getByText(/Nema novih uvida/)).toBeInTheDocument();
  });

  it('renders dismiss buttons (one per row)', async () => {
    const ui = await InsightsWidget({ insightsPromise: Promise.resolve(ITEMS) });
    render(ui);
    expect(screen.getAllByLabelText('Skloni uvid')).toHaveLength(2);
  });
});
