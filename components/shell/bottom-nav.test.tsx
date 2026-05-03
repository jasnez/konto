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

describe('BottomNav — 3 links + FAB + Više sheet', () => {
  it('renders exactly 3 direct nav links (Početna, Računi, Transakcije)', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/pocetna',
      '/racuni',
      '/transakcije',
    ]);
  });

  it('renders the "Više" overflow sheet trigger as the 4th slot', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    const moreBtn = within(nav).getByRole('button', { name: 'Više' });
    expect(moreBtn).toBeInTheDocument();
    // Trigger is a button, not a link — the menu opens a Sheet inline.
    expect(moreBtn.tagName).toBe('BUTTON');
  });

  it('does NOT include Kategorije or Budžeti as direct bottom-nav links', () => {
    // Both are reachable via the Više sheet — making the bottom-nav slot
    // a button instead of a hidden link is the whole point of the
    // refactor, so this guards against regressions.
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    expect(within(nav).queryByRole('link', { name: /kategorije/iu })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /budžeti/iu })).toBeNull();
  });

  it('renders the FAB inline inside the nav element (not as a separate floating overlay)', () => {
    render(<BottomNav />);
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' });
    const fab = within(nav).getByTestId('fab-brzi-unos');
    expect(fab).toBeInTheDocument();
    expect(screen.getAllByTestId('fab-brzi-unos')).toHaveLength(1);
  });

  it('marks the active route with aria-current=page', () => {
    render(<BottomNav />);
    const link = screen.getByRole('link', { name: /Početna/u });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
