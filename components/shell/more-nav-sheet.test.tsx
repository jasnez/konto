// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoreNavSheet } from './more-nav-sheet';
import { BOTTOM_NAV_ITEMS, NAV_ITEMS } from './nav-items';

vi.mock('next/navigation', () => ({
  usePathname: () => '/budzeti',
}));

describe('MoreNavSheet', () => {
  it('renders the trigger button labelled "Više"', () => {
    render(<MoreNavSheet />);
    const btn = screen.getByRole('button', { name: 'Više' });
    expect(btn).toBeInTheDocument();
  });

  it('marks the trigger as active when current path is not in BOTTOM_NAV_ITEMS', () => {
    // Mocked pathname is /budzeti — not in BOTTOM_NAV_ITEMS — so trigger
    // should carry aria-current=page to indicate the user is "inside Više".
    render(<MoreNavSheet />);
    const btn = screen.getByRole('button', { name: 'Više' });
    expect(btn).toHaveAttribute('aria-current', 'page');
  });

  it('opens a Sheet listing every NAV_ITEMS route not in BOTTOM_NAV_ITEMS', async () => {
    const user = userEvent.setup();
    render(<MoreNavSheet />);
    await user.click(screen.getByRole('button', { name: 'Više' }));

    // Compute the expected overflow set from the actual data so the test
    // tracks future NAV_ITEMS additions automatically.
    const expectedHrefs = NAV_ITEMS.filter(
      (item) => !BOTTOM_NAV_ITEMS.some((b) => b.href === item.href),
    ).map((item) => item.href);

    // Sheet content lives inside a portal — query the document instead of
    // narrowing within the trigger.
    const sheetNav = await screen.findByRole('navigation', { name: 'Dodatne stranice' });
    const links = within(sheetNav).getAllByRole('link');
    const actualHrefs = links.map((a) => a.getAttribute('href'));
    expect(actualHrefs).toEqual(expectedHrefs);
  });

  it('always includes /budzeti and /podesavanja in the sheet (regression guard)', async () => {
    const user = userEvent.setup();
    render(<MoreNavSheet />);
    await user.click(screen.getByRole('button', { name: 'Više' }));
    const sheetNav = await screen.findByRole('navigation', { name: 'Dodatne stranice' });
    const links = within(sheetNav).getAllByRole('link');
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/budzeti');
    expect(hrefs).toContain('/podesavanja');
  });

  it('marks the current route inside the sheet with aria-current=page', async () => {
    const user = userEvent.setup();
    render(<MoreNavSheet />);
    await user.click(screen.getByRole('button', { name: 'Više' }));
    const budgetsLink = await screen.findByRole('link', { name: /Budžeti/u });
    expect(budgetsLink).toHaveAttribute('aria-current', 'page');
  });
});
