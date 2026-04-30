import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BottomNav } from './bottom-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pocetna',
}));

vi.mock('@/stores/ui', () => ({
  useUiStore: (
    selector: (state: {
      quickAddOpen: boolean;
      openQuickAdd: () => void;
      closeQuickAdd: () => void;
    }) => unknown,
  ) =>
    selector({
      quickAddOpen: false,
      openQuickAdd: vi.fn(),
      closeQuickAdd: vi.fn(),
    }),
}));

describe('BottomNav — integrated 4 + FAB layout', () => {
  it('renders exactly 4 nav links (Početna, Računi, Transakcije, Više)', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/pocetna',
      '/racuni',
      '/transakcije',
      '/podesavanja',
    ]);
  });

  it('does NOT include Kategorije in the mobile bottom nav', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    expect(within(nav).queryByRole('link', { name: /kategorije/i })).toBeNull();
    expect(within(nav).queryByText(/^Kat\.$/)).toBeNull();
  });

  it('renders the FAB inline inside the nav element (not as a separate floating overlay)', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    const fab = within(nav).getByTestId('fab-brzi-unos');
    expect(fab).toBeInTheDocument();
    // The FAB lives in the same <nav> as the link slots — i.e., no
    // separate fixed overlay div. Sanity check: only ONE FAB on the page.
    expect(screen.getAllByTestId('fab-brzi-unos')).toHaveLength(1);
  });

  it('marks the active route with aria-current=page', () => {
    render(<BottomNav />);
    const link = screen.getByRole('link', { name: /Početna/ });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
