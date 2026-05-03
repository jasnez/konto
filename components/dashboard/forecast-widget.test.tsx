// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ForecastWidget,
  type SerializedForecast,
  type SerializedForecastDay,
} from './forecast-widget';

// Recharts in jsdom needs an explicit container size to render anything.
// Stubbing ResponsiveContainer to a fixed-size <div> is the canonical
// workaround per Recharts docs.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

function makeDay(
  date: string,
  balanceCents: bigint,
  events: SerializedForecastDay['events'] = [],
): SerializedForecastDay {
  return {
    date,
    balanceCents: balanceCents.toString(),
    inflowCents: '0',
    outflowCents: '0',
    events,
  };
}

function makeForecast(opts: {
  startBalanceCents?: bigint;
  daysAhead?: number;
  projections?: SerializedForecastDay[];
  warnings?: string[];
  lowestPoint?: { date: string; balanceCents: bigint } | null;
}): SerializedForecast {
  return {
    baseCurrency: 'BAM',
    startBalanceCents: (opts.startBalanceCents ?? 100_000n).toString(),
    startDate: '2026-04-15',
    daysAhead: opts.daysAhead ?? 90,
    projections: opts.projections ?? [],
    lowestPoint:
      opts.lowestPoint === undefined
        ? null
        : opts.lowestPoint === null
          ? null
          : {
              date: opts.lowestPoint.date,
              balanceCents: opts.lowestPoint.balanceCents.toString(),
            },
    warnings: opts.warnings ?? [],
  };
}

/** Helper: N fake days with given start + linear delta. */
function linearProjection(start: bigint, delta: bigint, count = 90): SerializedForecastDay[] {
  const out: SerializedForecastDay[] = [];
  for (let i = 1; i <= count; i += 1) {
    const balance = start + delta * BigInt(i);
    // Cycle days within April so we don't have to care about month rollover
    // for these unit tests — the date string isn't asserted on.
    out.push(makeDay(`2026-04-${String(15 + (i % 14)).padStart(2, '0')}`, balance));
  }
  return out;
}

describe('ForecastWidget', () => {
  it('renders the title and 30/60/90 tabs', () => {
    render(<ForecastWidget forecast={makeForecast({ projections: [] })} />);
    expect(screen.getByText('Projekcija')).toBeTruthy();
    const tabs = screen.getByRole('tablist', { name: 'Period projekcije' });
    expect(within(tabs).getByRole('tab', { name: '30 dana' })).toBeTruthy();
    expect(within(tabs).getByRole('tab', { name: '60 dana' })).toBeTruthy();
    expect(within(tabs).getByRole('tab', { name: '90 dana' })).toBeTruthy();
  });

  it('shows empty state when projections are empty', () => {
    render(<ForecastWidget forecast={makeForecast({ startBalanceCents: 0n, projections: [] })} />);
    expect(screen.getByText(/Dodaj prvu transakciju/u)).toBeTruthy();
  });

  it('shows insufficient-history warning banner alongside the chart', () => {
    render(
      <ForecastWidget
        forecast={makeForecast({
          projections: linearProjection(100_000n, -100n),
          warnings: ['Treba ti barem 30 dana istorije za pouzdanu projekciju (trenutno 5).'],
        })}
      />,
    );
    expect(screen.getByText(/30 dana istorije/u)).toBeTruthy();
  });

  it('shows success runway stripe when balance never crosses zero', () => {
    render(
      <ForecastWidget
        forecast={makeForecast({
          startBalanceCents: 1_000_000n,
          projections: linearProjection(1_000_000n, 0n),
        })}
      />,
    );
    expect(screen.getByText(/Novac će istrajati barem 30 dana/u)).toBeTruthy();
  });

  it('shows warning runway stripe when balance crosses zero in the visible window', () => {
    // Sharply declining: 100k start, -10k/day → crosses zero around day 11.
    render(
      <ForecastWidget
        forecast={makeForecast({
          startBalanceCents: 100_000n,
          projections: linearProjection(100_000n, -10_000n),
        })}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Negativan saldo očekivan/u)).toBeTruthy();
  });

  it('switches the visible window when a different tab is clicked (recomputes runway)', async () => {
    // Decline that crosses zero around day 50: at 30-day default → no warning,
    // at 60 → warning shows up.
    const user = userEvent.setup();
    render(
      <ForecastWidget
        forecast={makeForecast({
          startBalanceCents: 100_000n,
          projections: linearProjection(100_000n, -2_000n),
        })}
      />,
    );
    // Start: 30 days, balance still positive.
    expect(screen.queryByText(/Negativan saldo očekivan/u)).toBeNull();
    expect(screen.getByText(/Novac će istrajati barem 30 dana/u)).toBeTruthy();

    // Switch to 60.
    await user.click(screen.getByRole('tab', { name: '60 dana' }));
    expect(screen.getByText(/Negativan saldo očekivan/u)).toBeTruthy();
  });

  it('renders the alert role for runway warnings (a11y)', () => {
    render(
      <ForecastWidget
        forecast={makeForecast({
          startBalanceCents: 100_000n,
          projections: linearProjection(100_000n, -10_000n),
        })}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
