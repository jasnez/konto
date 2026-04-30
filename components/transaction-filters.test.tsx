import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionFilters } from './transaction-filters';
import type { TransactionsFilters } from '@/app/(app)/transakcije/types';

const accounts = [
  { id: 'acc-1', name: 'Tekući', currency: 'BAM' as const },
  { id: 'acc-2', name: 'EUR račun', currency: 'EUR' as const },
];

const categories = [
  { id: 'cat-1', name: 'Hrana', icon: '🍔', kind: 'expense' as const },
  { id: 'cat-2', name: 'Plata', icon: '💰', kind: 'income' as const },
];

function makeFilters(overrides?: Partial<TransactionsFilters>): TransactionsFilters {
  return {
    accountIds: [],
    categoryIds: [],
    from: '',
    to: '',
    search: '',
    page: 1,
    type: '',
    ...overrides,
  };
}

interface RenderProps {
  filters?: TransactionsFilters;
  searchDraft?: string;
  onUpdate?: (updates: Record<string, string | null>) => void;
  onToggleMulti?: (paramName: 'account' | 'category', id: string, checked: boolean) => void;
  onSearchDraftChange?: (value: string) => void;
  onClearAll?: () => void;
}

function renderFilters({
  filters = makeFilters(),
  searchDraft = '',
  onUpdate = vi.fn<(updates: Record<string, string | null>) => void>(),
  onToggleMulti = vi.fn<
    (paramName: 'account' | 'category', id: string, checked: boolean) => void
  >(),
  onSearchDraftChange = vi.fn<(value: string) => void>(),
  onClearAll = vi.fn<() => void>(),
}: RenderProps = {}) {
  const result = render(
    <TransactionFilters
      filters={filters}
      accounts={accounts}
      categories={categories}
      searchDraft={searchDraft}
      onSearchDraftChange={onSearchDraftChange}
      onUpdate={onUpdate}
      onToggleMulti={onToggleMulti}
      onClearAll={onClearAll}
    />,
  );
  return { ...result, onUpdate, onToggleMulti, onSearchDraftChange, onClearAll };
}

describe('TransactionFilters — search row', () => {
  it('renders search input with localized aria-label', () => {
    renderFilters();
    expect(screen.getByRole('textbox', { name: 'Pretraga transakcija' })).toBeInTheDocument();
  });

  it('calls onSearchDraftChange when typing in search', async () => {
    const user = userEvent.setup();
    const { onSearchDraftChange } = renderFilters();
    const input = screen.getByRole('textbox', { name: 'Pretraga transakcija' });
    await user.type(input, 'k');
    expect(onSearchDraftChange).toHaveBeenCalledWith('k');
  });
});

describe('TransactionFilters — Filteri trigger badge', () => {
  it('shows no count when no filters are active', () => {
    renderFilters();
    const trigger = screen.getByRole('button', { name: 'Filteri' });
    // Count badge would be a child element; verify it's absent
    expect(within(trigger).queryByText(/^\d+$/)).toBeNull();
  });

  it('shows accurate count for date-only filters', () => {
    renderFilters({ filters: makeFilters({ from: '2026-04-01', to: '2026-04-30' }) });
    expect(screen.getByRole('button', { name: 'Filteri (2 aktivnih)' })).toBeInTheDocument();
  });

  it('shows accurate count combining all filter types', () => {
    renderFilters({
      filters: makeFilters({
        from: '2026-04-01',
        to: '2026-04-30',
        accountIds: ['acc-1', 'acc-2'],
        categoryIds: ['cat-1'],
        type: 'expense',
      }),
    });
    // 2 dates + 2 accounts + 1 category + 1 type = 6
    expect(screen.getByRole('button', { name: 'Filteri (6 aktivnih)' })).toBeInTheDocument();
  });

  it('search alone does NOT count toward the badge (search has its own input)', () => {
    renderFilters({ filters: makeFilters({ search: 'kava' }) });
    const trigger = screen.getByRole('button', { name: 'Filteri' });
    expect(within(trigger).queryByText(/^\d+$/)).toBeNull();
  });
});

describe('TransactionFilters — active-filter chip strip', () => {
  it('does NOT render the strip region when no chip-eligible filters are active', () => {
    renderFilters();
    expect(screen.queryByRole('region', { name: 'Aktivni filteri' })).toBeNull();
  });

  it('renders the strip when a date filter is active', () => {
    renderFilters({ filters: makeFilters({ from: '2026-04-01' }) });
    expect(screen.getByRole('region', { name: 'Aktivni filteri' })).toBeInTheDocument();
  });

  it('formats the date in bs locale on the chip label', () => {
    renderFilters({ filters: makeFilters({ from: '2026-04-01' }) });
    expect(screen.getByText(/Od: 1\. apr 2026\./)).toBeInTheDocument();
  });

  it('localizes the aria-label on date removable chips', () => {
    renderFilters({ filters: makeFilters({ to: '2026-04-30' }) });
    expect(
      screen.getByRole('button', { name: 'Ukloni filter: Do 30. apr 2026.' }),
    ).toBeInTheDocument();
  });

  it('renders account chip with the resolved account name', () => {
    renderFilters({ filters: makeFilters({ accountIds: ['acc-1'] }) });
    const region = screen.getByRole('region', { name: 'Aktivni filteri' });
    expect(
      within(region).getByRole('button', { name: 'Ukloni filter: Tekući' }),
    ).toBeInTheDocument();
  });

  it('renders category chip with icon and category name', () => {
    renderFilters({ filters: makeFilters({ categoryIds: ['cat-1'] }) });
    const region = screen.getByRole('region', { name: 'Aktivni filteri' });
    // aria-label contains just the name (icon is decorative); visible label has the icon
    expect(
      within(region).getByRole('button', { name: 'Ukloni filter: Hrana' }),
    ).toBeInTheDocument();
    expect(within(region).getByText(/🍔 Hrana/)).toBeInTheDocument();
  });

  it('renders type chip with localized type label', () => {
    renderFilters({ filters: makeFilters({ type: 'income' }) });
    expect(screen.getByRole('button', { name: 'Ukloni filter: Prihod' })).toBeInTheDocument();
  });

  it('clicking a removable chip calls onUpdate with null for that param', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderFilters({ filters: makeFilters({ from: '2026-04-01' }) });
    await user.click(screen.getByRole('button', { name: 'Ukloni filter: Od 1. apr 2026.' }));
    expect(onUpdate).toHaveBeenCalledWith({ from: null, page: '1' });
  });

  it('clicking a removable account chip calls onToggleMulti with checked=false', async () => {
    const user = userEvent.setup();
    const { onToggleMulti } = renderFilters({
      filters: makeFilters({ accountIds: ['acc-1'] }),
    });
    await user.click(screen.getByRole('button', { name: 'Ukloni filter: Tekući' }));
    expect(onToggleMulti).toHaveBeenCalledWith('account', 'acc-1', false);
  });

  it('skips chips for ids not present in the accounts/categories list (defensive)', () => {
    renderFilters({
      filters: makeFilters({ accountIds: ['acc-deleted'], categoryIds: ['cat-deleted'] }),
    });
    // Region IS rendered (count > 0) but defensive null-skip means no orphan chips
    const region = screen.getByRole('region', { name: 'Aktivni filteri' });
    expect(within(region).queryByRole('button', { name: /Ukloni filter:/ })).toBeNull();
  });
});

describe('TransactionFilters — formatBsDate fallback', () => {
  it('renders raw ISO when given an unparseable string (current behavior, P2.2 will improve)', () => {
    renderFilters({ filters: makeFilters({ from: 'foo' }) });
    // This documents current graceful behavior — future P2.2 may change to '?'
    // but the chip stays clickable so user can remove it
    expect(screen.getByText(/Od:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ukloni filter: Od/ })).toBeInTheDocument();
  });
});
