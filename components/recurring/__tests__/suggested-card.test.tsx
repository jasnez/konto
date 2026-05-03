// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestedCard } from '../suggested-card';
import type { SuggestedCandidate } from '@/app/(app)/pretplate/actions';

const BASE: SuggestedCandidate = {
  groupKey: 'merchant:abc:BAM',
  merchantId: 'abc',
  description: 'Netflix',
  period: 'monthly',
  averageAmountCents: '-1500',
  currency: 'BAM',
  lastSeen: '2026-05-01',
  nextExpected: '2026-06-01',
  confidence: 0.92,
  occurrences: 6,
  transactionIds: ['t-1', 't-2'],
  suggestedCategoryId: null,
};

describe('SuggestedCard', () => {
  it('renders description, occurrences, and amount', () => {
    render(<SuggestedCard candidate={BASE} onConfirm={vi.fn()} onIgnore={vi.fn()} />);
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText(/6×/u)).toBeTruthy();
    expect(screen.getByText(/mjesečno/u)).toBeTruthy();
  });

  it('shows "Visoko" tier pill for confidence ≥ 0.7', () => {
    render(<SuggestedCard candidate={BASE} onConfirm={vi.fn()} onIgnore={vi.fn()} />);
    expect(screen.getByText('Visoko')).toBeTruthy();
  });

  it('shows "Srednje" tier pill for confidence < 0.7', () => {
    render(
      <SuggestedCard
        candidate={{ ...BASE, confidence: 0.55 }}
        onConfirm={vi.fn()}
        onIgnore={vi.fn()}
      />,
    );
    expect(screen.getByText('Srednje')).toBeTruthy();
  });

  it('fires onConfirm when "Potvrdi" clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<SuggestedCard candidate={BASE} onConfirm={onConfirm} onIgnore={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Potvrdi/u }));
    expect(onConfirm).toHaveBeenCalledWith(BASE);
  });

  it('fires onIgnore when "Ignoriši" clicked', async () => {
    const user = userEvent.setup();
    const onIgnore = vi.fn();
    render(<SuggestedCard candidate={BASE} onConfirm={vi.fn()} onIgnore={onIgnore} />);
    await user.click(screen.getByRole('button', { name: /Ignoriši Netflix/u }));
    expect(onIgnore).toHaveBeenCalledWith(BASE);
  });

  it('disables both buttons when busy', () => {
    render(<SuggestedCard candidate={BASE} onConfirm={vi.fn()} onIgnore={vi.fn()} busy />);
    const confirm = screen.getByRole('button', { name: /Potvrdi/u });
    const ignore = screen.getByRole('button', { name: /Ignoriši/u });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((ignore as HTMLButtonElement).disabled).toBe(true);
  });
});
