// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlyEquivalentFooter } from '../monthly-equivalent-footer';
import type { ActiveRecurring } from '@/lib/queries/recurring';

function item(overrides: Partial<ActiveRecurring> & { id: string }): ActiveRecurring {
  return {
    id: overrides.id,
    description: overrides.description ?? 'Sub',
    period: overrides.period ?? 'monthly',
    averageAmountCents: overrides.averageAmountCents ?? -1500n,
    currency: overrides.currency ?? 'BAM',
    nextExpectedDate: overrides.nextExpectedDate ?? null,
    lastSeenDate: overrides.lastSeenDate ?? null,
    pausedUntil: overrides.pausedUntil ?? null,
    isPaused: overrides.isPaused ?? false,
    detectionConfidence: overrides.detectionConfidence ?? null,
    occurrences: overrides.occurrences ?? 6,
    merchantId: overrides.merchantId ?? null,
    categoryId: overrides.categoryId ?? null,
    accountId: overrides.accountId ?? null,
    merchantName: overrides.merchantName ?? null,
    categoryName: overrides.categoryName ?? null,
    accountName: overrides.accountName ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('MonthlyEquivalentFooter', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<MonthlyEquivalentFooter items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows total per currency (BAM rendered as "KM" symbol)', () => {
    render(
      <MonthlyEquivalentFooter
        items={[
          item({ id: '1', currency: 'BAM', averageAmountCents: -1500n }),
          item({ id: '2', currency: 'EUR', averageAmountCents: -800n }),
        ]}
      />,
    );
    // formatMoney renders BAM as "KM" and EUR literally. Both currencies
    // get their own line in the footer.
    expect(screen.getByText(/KM/u)).toBeTruthy();
    expect(screen.getByText(/EUR/u)).toBeTruthy();
  });

  it('skips paused rows from totals', () => {
    render(
      <MonthlyEquivalentFooter
        items={[
          item({ id: '1', currency: 'BAM', averageAmountCents: -1500n, isPaused: false }),
          item({ id: '2', currency: 'BAM', averageAmountCents: -3000n, isPaused: true }),
        ]}
      />,
    );
    // Active count = 1 (paused excluded). Test the count line.
    expect(screen.getByText(/1 pretplata/u)).toBeTruthy();
  });
});
