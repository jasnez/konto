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

// MT-11: ForecastWidget uses useRouter for the refresh button. Stub the
// app router so renders don't throw "invariant: app router not mounted".
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

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
  baselineInflowCents?: bigint;
  baselineOutflowCents?: bigint;
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
    baselineInflowCents: (opts.baselineInflowCents ?? 0n).toString(),
    baselineOutflowCents: (opts.baselineOutflowCents ?? 0n).toString(),
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

  it('shows empty state (no accounts) when start balance is zero and projections are empty', () => {
    // DL-11: differentiated empty state. startBalance === 0 → "no accounts"
    // copy with CTA to /racuni/novi.
    render(<ForecastWidget forecast={makeForecast({ startBalanceCents: 0n, projections: [] })} />);
    expect(screen.getByText(/Dodaj svoj prvi račun/u)).toBeTruthy();
  });

  it('shows empty state (no events) when there is balance but no projection events', () => {
    // DL-11: when startBalance > 0 but events list is empty, show "add
    // transactions/recurring" copy instead.
    render(
      <ForecastWidget forecast={makeForecast({ startBalanceCents: 50_000n, projections: [] })} />,
    );
    expect(screen.getByText(/Dodaj prve transakcije/u)).toBeTruthy();
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

  it('renders "Kako se ovo računa" explainer with the user\'s start balance', () => {
    render(
      <ForecastWidget
        forecast={makeForecast({
          startBalanceCents: 1_271_879n,
          baselineInflowCents: 20_402n,
          baselineOutflowCents: 22_871n,
          projections: linearProjection(1_271_879n, -2_469n),
        })}
      />,
    );
    const summary = screen.getByText('Kako se ovo računa?');
    expect(summary).toBeTruthy();
    // The dynamic numbers from the explainer should render somewhere in the
    // collapsible body. <details> in jsdom is closed by default but the
    // content is in the DOM (just not visible) — querying still works.
    expect(screen.getByText(/12. ?71[\d.,\s]*KM/u)).toBeTruthy();
  });

  it('shows the "Šta utiče na projekciju" empty-state link when no recurring or installments', () => {
    render(
      <ForecastWidget
        forecast={makeForecast({
          projections: linearProjection(100_000n, 0n),
        })}
        recurring={[]}
        installments={[]}
      />,
    );
    expect(screen.getByText(/Još nemaš zakazane uplate/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'pretplate' })).toBeTruthy();
  });

  it('lists active recurring entries with their period label and paused badge', async () => {
    const user = userEvent.setup();
    render(
      <ForecastWidget
        forecast={makeForecast({
          projections: linearProjection(100_000n, 0n),
        })}
        recurring={[
          {
            id: 'r1',
            description: 'Netflix',
            averageAmountCents: -1_500,
            currency: 'BAM',
            periodLabel: 'mjesečno',
            pausedUntil: null,
          },
          {
            id: 'r2',
            description: 'Stari servis',
            averageAmountCents: -800,
            currency: 'BAM',
            periodLabel: 'mjesečno',
            pausedUntil: '2099-12-31',
          },
        ]}
        installments={[]}
      />,
    );

    // Open the collapsible so the list contents are queryable by visible text.
    await user.click(screen.getByText(/Šta utiče na projekciju/u));

    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('Stari servis')).toBeTruthy();
    expect(screen.getByText('pauzirano')).toBeTruthy();
  });

  it('lists installment plans with remaining count and day-of-month', async () => {
    const user = userEvent.setup();
    render(
      <ForecastWidget
        forecast={makeForecast({
          projections: linearProjection(100_000n, 0n),
        })}
        recurring={[]}
        installments={[
          {
            id: 'i1',
            label: 'Iphone 14',
            totalCount: 6,
            installmentCents: 25_000,
            currency: 'BAM',
            dayOfMonth: 10,
          },
        ]}
      />,
    );

    await user.click(screen.getByText(/Šta utiče na projekciju/u));

    expect(screen.getByText('Iphone 14')).toBeTruthy();
    expect(screen.getByText(/6 rata, 10. u mjesecu/u)).toBeTruthy();
  });
});
