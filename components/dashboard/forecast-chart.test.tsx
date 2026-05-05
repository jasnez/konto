// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartTooltip } from './forecast-chart';
import type { ForecastEvent } from '@/lib/analytics/forecast';

function payload(opts: {
  inflowCents: bigint;
  outflowCents: bigint;
  events?: ForecastEvent[];
  date?: string;
  balanceLabel?: string;
}) {
  return [
    {
      payload: {
        date: opts.date ?? '2026-05-06',
        balance: 1_269_410,
        balanceLabel: opts.balanceLabel ?? '12.694,10 KM',
        inflowCents: opts.inflowCents,
        outflowCents: opts.outflowCents,
        events: opts.events ?? [],
      },
    },
  ];
}

describe('ChartTooltip', () => {
  it('returns null when not active', () => {
    const { container } = render(<ChartTooltip currency="BAM" active={false} />);
    expect(container.textContent).toBe('');
  });

  it('always shows Prihod / Trošak / Neto block even on a baseline-only day', () => {
    render(
      <ChartTooltip
        currency="BAM"
        active
        payload={payload({
          inflowCents: 20_402n,
          outflowCents: 22_871n,
          events: [
            {
              type: 'baseline',
              description: 'Prosječna dnevna potrošnja',
              amountCents: -2_469n,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('Prihod')).toBeTruthy();
    expect(screen.getByText('Trošak')).toBeTruthy();
    expect(screen.getByText('Neto')).toBeTruthy();
    // Baseline event is shown rather than filtered out.
    expect(screen.getByText('Prosječna dnevna potrošnja')).toBeTruthy();
  });

  it('puts the baseline event first when both baseline and a recurring fall on the same day', () => {
    render(
      <ChartTooltip
        currency="BAM"
        active
        payload={payload({
          inflowCents: 20_402n,
          outflowCents: 24_371n,
          events: [
            {
              type: 'recurring',
              description: 'Netflix',
              amountCents: -1_500n,
            },
            {
              type: 'baseline',
              description: 'Prosječna dnevna potrošnja',
              amountCents: -2_469n,
            },
          ],
        })}
      />,
    );
    const items = screen.getAllByRole('listitem');
    // First item must be the baseline ("Prosječna dnevna potrošnja").
    expect(items[0].textContent).toContain('Prosječna dnevna potrošnja');
    expect(items[1].textContent).toContain('Netflix');
  });
});
