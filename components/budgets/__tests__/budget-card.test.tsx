// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BudgetCard } from '../budget-card';
import type { BudgetWithProgress } from '@/lib/queries/budgets';

const SAMPLE: BudgetWithProgress = {
  id: 'b1',
  amountCents: 100_000n, // 1000 BAM
  spentCents: 25_000n, // 250 BAM
  currency: 'BAM',
  period: 'monthly',
  active: true,
  rollover: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  progress: 0.25,
  daysLeft: 12,
  category: {
    id: 'cat-1',
    name: 'Hrana',
    slug: 'hrana',
    icon: '🍔',
    color: null,
    kind: 'expense',
  },
};

function withProgress(
  progress: number,
  opts: Partial<BudgetWithProgress> = {},
): BudgetWithProgress {
  const amount = SAMPLE.amountCents;
  const spent = (amount * BigInt(Math.round(progress * 100))) / 100n;
  return { ...SAMPLE, ...opts, progress, spentCents: spent };
}

const noop = vi.fn();

describe('BudgetCard', () => {
  it('renders category name, period badge, and percent', () => {
    render(<BudgetCard budget={SAMPLE} onEdit={noop} onToggleActive={noop} onDelete={noop} />);
    expect(screen.getByText('Hrana')).toBeTruthy();
    expect(screen.getByText('Mjesečno')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('uses green palette below 70%', () => {
    const { container } = render(
      <BudgetCard budget={withProgress(0.5)} onEdit={noop} onToggleActive={noop} onDelete={noop} />,
    );
    expect(container.querySelector('.ring-emerald-500\\/30')).toBeTruthy();
  });

  it('uses amber palette between 70% and 95%', () => {
    const { container } = render(
      <BudgetCard
        budget={withProgress(0.85)}
        onEdit={noop}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );
    expect(container.querySelector('.ring-amber-500\\/30')).toBeTruthy();
  });

  it('uses red palette at or above 95%', () => {
    const { container } = render(
      <BudgetCard
        budget={withProgress(0.96)}
        onEdit={noop}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );
    expect(container.querySelector('.ring-destructive\\/30')).toBeTruthy();
  });

  it('shows "Premašen za X" when overrun', () => {
    render(
      <BudgetCard budget={withProgress(1.2)} onEdit={noop} onToggleActive={noop} onDelete={noop} />,
    );
    expect(screen.getByText(/Premašen za/u)).toBeTruthy();
  });

  it('shows remaining amount when within budget', () => {
    render(
      <BudgetCard budget={withProgress(0.4)} onEdit={noop} onToggleActive={noop} onDelete={noop} />,
    );
    expect(screen.getByText(/preostalo/u)).toBeTruthy();
  });

  it('shows "Posljednji dan" when daysLeft is 0', () => {
    render(
      <BudgetCard
        budget={{ ...SAMPLE, daysLeft: 0 }}
        onEdit={noop}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText(/Posljednji dan/u)).toBeTruthy();
  });

  it('shows "Deaktiviran" footer when budget is inactive', () => {
    render(
      <BudgetCard
        budget={{ ...SAMPLE, active: false }}
        onEdit={noop}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText('Deaktiviran')).toBeTruthy();
  });

  it('fires onEdit when "Uredi" menu item is selected', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<BudgetCard budget={SAMPLE} onEdit={onEdit} onToggleActive={noop} onDelete={noop} />);
    await user.click(screen.getByRole('button', { name: 'Meni za budžet' }));
    await user.click(await screen.findByText('Uredi'));
    expect(onEdit).toHaveBeenCalledWith('b1');
  });

  it('toggles to "Aktiviraj" label when budget is inactive', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <BudgetCard
        budget={{ ...SAMPLE, active: false }}
        onEdit={noop}
        onToggleActive={onToggle}
        onDelete={noop}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Meni za budžet' }));
    const item = await screen.findByText('Aktiviraj');
    await user.click(item);
    expect(onToggle).toHaveBeenCalledWith('b1', true);
  });

  it('fires onDelete when "Obriši" menu item is selected', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<BudgetCard budget={SAMPLE} onEdit={noop} onToggleActive={noop} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'Meni za budžet' }));
    await user.click(await screen.findByText('Obriši'));
    expect(onDelete).toHaveBeenCalledWith('b1');
  });

  it('Meni button has touch-target ≥ 44px (h-11 w-11)', () => {
    render(<BudgetCard budget={SAMPLE} onEdit={noop} onToggleActive={noop} onDelete={noop} />);
    const btn = screen.getByRole('button', { name: 'Meni za budžet' });
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
  });

  it('renders deaktivated card with reduced opacity', () => {
    const { container } = render(
      <BudgetCard
        budget={{ ...SAMPLE, active: false }}
        onEdit={noop}
        onToggleActive={noop}
        onDelete={noop}
      />,
    );
    const card = container.querySelector('[data-testid="budget-card"]');
    expect(card?.className).toContain('opacity-60');
  });

  it('formats spent / total with currency in copy', () => {
    render(<BudgetCard budget={SAMPLE} onEdit={noop} onToggleActive={noop} onDelete={noop} />);
    // 250 BAM spent of 1000 BAM
    const card = screen.getByTestId('budget-card');
    const text = within(card).getByText(/1\.000/u);
    expect(text).toBeTruthy();
  });
});
