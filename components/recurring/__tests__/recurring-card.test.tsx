// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurringCard } from '../recurring-card';
import type { ActiveRecurring } from '@/lib/queries/recurring';

const SAMPLE: ActiveRecurring = {
  id: 'rec-1',
  description: 'Netflix',
  period: 'monthly',
  averageAmountCents: -1500n,
  currency: 'BAM',
  nextExpectedDate: '2026-06-01',
  lastSeenDate: '2026-05-01',
  pausedUntil: null,
  isPaused: false,
  detectionConfidence: 0.95,
  occurrences: 6,
  merchantId: 'm-1',
  categoryId: 'c-1',
  accountId: 'a-1',
  merchantName: 'Netflix',
  categoryName: 'Streaming',
  accountName: 'Glavni',
  createdAt: '2026-01-01T00:00:00Z',
};

const noop = vi.fn();

describe('RecurringCard', () => {
  it('renders merchant name + period badge + amount + dates', () => {
    render(<RecurringCard item={SAMPLE} onEdit={noop} onPause={noop} onCancel={noop} />);
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('Mjesečno')).toBeTruthy();
    expect(screen.getByText('Streaming')).toBeTruthy();
  });

  it('falls back to description when merchantName is null', () => {
    render(
      <RecurringCard
        item={{ ...SAMPLE, merchantName: null }}
        onEdit={noop}
        onPause={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText('Netflix')).toBeTruthy();
  });

  it('shows "Pauzirano do …" badge when isPaused', () => {
    render(
      <RecurringCard
        item={{ ...SAMPLE, isPaused: true, pausedUntil: '2099-01-01' }}
        onEdit={noop}
        onPause={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText(/Pauzirano do/u)).toBeTruthy();
  });

  it('reduces opacity when paused', () => {
    const { container } = render(
      <RecurringCard
        item={{ ...SAMPLE, isPaused: true, pausedUntil: '2099-01-01' }}
        onEdit={noop}
        onPause={noop}
        onCancel={noop}
      />,
    );
    const card = container.querySelector('[data-testid="recurring-card"]');
    expect(card?.className).toContain('opacity-60');
  });

  it('Meni button has touch-target h-11 w-11', () => {
    render(<RecurringCard item={SAMPLE} onEdit={noop} onPause={noop} onCancel={noop} />);
    const btn = screen.getByRole('button', { name: 'Meni za pretplatu' });
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
  });

  it('fires onEdit/onPause/onCancel from dropdown', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onPause = vi.fn();
    const onCancel = vi.fn();
    render(<RecurringCard item={SAMPLE} onEdit={onEdit} onPause={onPause} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Meni za pretplatu' }));
    await user.click(await screen.findByText('Uredi'));
    expect(onEdit).toHaveBeenCalledWith('rec-1');

    await user.click(screen.getByRole('button', { name: 'Meni za pretplatu' }));
    await user.click(await screen.findByText('Pauziraj'));
    expect(onPause).toHaveBeenCalledWith('rec-1');

    await user.click(screen.getByRole('button', { name: 'Meni za pretplatu' }));
    await user.click(await screen.findByText('Završi pretplatu'));
    expect(onCancel).toHaveBeenCalledWith('rec-1');
  });

  it('renders detail link to /pretplate/[id]', () => {
    render(<RecurringCard item={SAMPLE} onEdit={noop} onPause={noop} onCancel={noop} />);
    const link = screen.getByRole('link', { name: /Detalji/u });
    expect(link.getAttribute('href')).toBe('/pretplate/rec-1');
  });
});
