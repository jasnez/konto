// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetsEmptyState } from '../empty-state';

describe('BudgetsEmptyState', () => {
  it('shows the standard empty copy when categories exist', () => {
    render(<BudgetsEmptyState onCreate={vi.fn()} hasCategories />);
    expect(screen.getByText('Postavi prvi budžet')).toBeTruthy();
    expect(screen.getByText(/Pratiti potrošnju po kategoriji/u)).toBeTruthy();
  });

  it('changes the helper copy when no budgetable categories exist', () => {
    render(<BudgetsEmptyState onCreate={vi.fn()} hasCategories={false} />);
    expect(screen.getByText(/Prvo kreiraj kategoriju/u)).toBeTruthy();
  });

  it('disables the CTA when no categories', () => {
    render(<BudgetsEmptyState onCreate={vi.fn()} hasCategories={false} />);
    const btn = screen.getByRole('button', { name: 'Postavi budžet' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('fires onCreate when CTA clicked', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<BudgetsEmptyState onCreate={onCreate} hasCategories />);
    await user.click(screen.getByRole('button', { name: 'Postavi budžet' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
