// @vitest-environment node

/**
 * TS-2 — Concurrent forecast regression guard.
 *
 * Pre-AV-7 fix: `forecast.ts` kept a module-local `eventDateMap` that paired
 * `ForecastEvent` objects with their dates by index. When two users called
 * `forecastCashflow` in `Promise.all`, the second call would overwrite the
 * first's entries (Map keys are object identity but indices collided), so the
 * day-by-day projection silently mixed events between users.
 *
 * AV-7 fix (PR #153): replaced the module-local Map with an inline
 * `DatedForecastEvent { event, dateIso }` carrier so each event keeps its date
 * within the call's stack frame. No shared state across calls.
 *
 * This test runs two distinct user fixtures concurrently and asserts that:
 *   1. Concurrent results match the sequential baseline byte-for-byte.
 *   2. The two users' results are distinct (no cross-contamination).
 *
 * If AV-7 ever regresses (someone re-introduces module-local mutable state),
 * concurrent vs sequential will diverge and this test will fail.
 */

import { describe, expect, it } from 'vitest';
import { addDays, format } from 'date-fns';
import {
  forecastCashflow,
  type AccountRow,
  type InstallmentRow,
  type RecurringRow,
} from '../forecast';

const NOW = new Date('2026-04-15T12:00:00Z');

// ─── Inline supabase mock (kept self-contained from forecast.test.ts) ──────

interface ChainResult<T> {
  data: T;
  error: null;
}

function fluent<T>(terminal: ChainResult<T>): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    gte: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    then: (resolve: (v: ChainResult<T>) => void) => {
      resolve(terminal);
    },
  };
  return chain;
}

interface FixtureHistoryRow {
  id?: string;
  transaction_date: string;
  base_amount_cents: number;
  original_amount_cents?: number;
  category_id?: string | null;
  account_id?: string;
  is_transfer?: boolean;
  transfer_pair_id?: string | null;
}

interface Fixture {
  accounts: AccountRow[];
  recurring?: RecurringRow[];
  installments?: InstallmentRow[];
  history?: FixtureHistoryRow[];
}

function makeSupabase(fx: Fixture): { from: never } {
  const accounts = fx.accounts;
  const recurring = fx.recurring ?? [];
  const installments = fx.installments ?? [];
  const SPENDING = ['checking', 'cash', 'credit_card', 'revolut', 'wise', 'other'];
  const defaultAcctId = accounts.find((a) => SPENDING.includes(a.type))?.id ?? 'default-acct';
  const history = (fx.history ?? []).map((h, idx) => ({
    id: h.id ?? `tx-${String(idx)}`,
    transaction_date: h.transaction_date,
    base_amount_cents: h.base_amount_cents,
    original_amount_cents: h.original_amount_cents ?? h.base_amount_cents,
    category_id: h.category_id ?? null,
    account_id: h.account_id ?? defaultAcctId,
    is_transfer: h.is_transfer ?? false,
    transfer_pair_id: h.transfer_pair_id ?? null,
  }));

  const fromMock = (table: string): unknown => {
    if (table === 'accounts') return fluent({ data: accounts, error: null });
    if (table === 'recurring_transactions') return fluent({ data: recurring, error: null });
    if (table === 'installment_plans') return fluent({ data: installments, error: null });
    if (table === 'transactions') return fluent({ data: history, error: null });
    if (table === 'categories') return fluent({ data: null, error: null });
    throw new Error(`Unmocked table: ${table}`);
  };
  return { from: fromMock as never };
}

const ACCOUNT_DEFAULTS: Pick<AccountRow, 'is_active' | 'include_in_net_worth' | 'deleted_at'> = {
  is_active: true,
  include_in_net_worth: true,
  deleted_at: null,
};

// ─── Two distinct user fixtures ────────────────────────────────────────────

function makeUserAFixture(): Fixture {
  return {
    accounts: [
      {
        id: 'a-acct-1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 100_000,
        ...ACCOUNT_DEFAULTS,
      },
    ],
    recurring: [
      {
        id: 'a-rec-1',
        description: 'User A — Netflix',
        period: 'monthly',
        average_amount_cents: -2500,
        currency: 'BAM',
        next_expected_date: format(addDays(NOW, 5), 'yyyy-MM-dd'),
        last_seen_date: null,
        paused_until: null,
        active: true,
      },
      {
        id: 'a-rec-2',
        description: 'User A — Salary',
        period: 'monthly',
        average_amount_cents: 250_000,
        currency: 'BAM',
        next_expected_date: format(addDays(NOW, 10), 'yyyy-MM-dd'),
        last_seen_date: null,
        paused_until: null,
        active: true,
      },
    ],
    installments: [
      {
        id: 'a-inst-1',
        notes: 'User A — laptop',
        account_id: 'a-acct-1',
        currency: 'BAM',
        installment_count: 6,
        installment_cents: 50_000,
        start_date: format(addDays(NOW, -30), 'yyyy-MM-dd'),
        day_of_month: 15,
        status: 'active',
      },
    ],
  };
}

function makeUserBFixture(): Fixture {
  return {
    accounts: [
      {
        id: 'b-acct-1',
        type: 'checking',
        currency: 'BAM',
        current_balance_cents: 50_000,
        ...ACCOUNT_DEFAULTS,
      },
    ],
    recurring: [
      {
        id: 'b-rec-1',
        description: 'User B — Spotify',
        period: 'monthly',
        average_amount_cents: -1500,
        currency: 'BAM',
        next_expected_date: format(addDays(NOW, 7), 'yyyy-MM-dd'),
        last_seen_date: null,
        paused_until: null,
        active: true,
      },
    ],
    installments: [
      {
        id: 'b-inst-1',
        notes: 'User B — phone',
        account_id: 'b-acct-1',
        currency: 'BAM',
        installment_count: 12,
        installment_cents: 30_000,
        start_date: format(addDays(NOW, -15), 'yyyy-MM-dd'),
        day_of_month: 1,
        status: 'active',
      },
      {
        id: 'b-inst-2',
        notes: 'User B — bicycle',
        account_id: 'b-acct-1',
        currency: 'BAM',
        installment_count: 4,
        installment_cents: 75_000,
        start_date: format(addDays(NOW, -7), 'yyyy-MM-dd'),
        day_of_month: 22,
        status: 'active',
      },
    ],
  };
}

describe('forecastCashflow — concurrent invocation (TS-2 / AV-7 regression guard)', () => {
  it('two parallel forecasts produce results identical to sequential baseline', async () => {
    // Each invocation gets its own supabase mock so the call frames are
    // genuinely independent — the only way they could contaminate each other
    // is via module-local mutable state inside forecast.ts (the AV-7 bug).
    const sequentialA = await forecastCashflow(makeSupabase(makeUserAFixture()), 'user-a', 30, {
      now: NOW,
      skipFx: true,
    });
    const sequentialB = await forecastCashflow(makeSupabase(makeUserBFixture()), 'user-b', 30, {
      now: NOW,
      skipFx: true,
    });

    const [concurrentA, concurrentB] = await Promise.all([
      forecastCashflow(makeSupabase(makeUserAFixture()), 'user-a', 30, {
        now: NOW,
        skipFx: true,
      }),
      forecastCashflow(makeSupabase(makeUserBFixture()), 'user-b', 30, {
        now: NOW,
        skipFx: true,
      }),
    ]);

    expect(concurrentA).toEqual(sequentialA);
    expect(concurrentB).toEqual(sequentialB);
  });

  it('parallel forecasts for different users return distinct outputs (no cross-contamination)', async () => {
    const [resA, resB] = await Promise.all([
      forecastCashflow(makeSupabase(makeUserAFixture()), 'user-a', 30, {
        now: NOW,
        skipFx: true,
      }),
      forecastCashflow(makeSupabase(makeUserBFixture()), 'user-b', 30, {
        now: NOW,
        skipFx: true,
      }),
    ]);

    // Distinct start balances — proves each call processed only its own
    // account fixture.
    expect(resA.startBalanceCents).toBe(100_000n);
    expect(resB.startBalanceCents).toBe(50_000n);
    expect(resA.startBalanceCents).not.toBe(resB.startBalanceCents);

    // Day-count parity (both ran 30 days ahead).
    expect(resA.projections).toHaveLength(30);
    expect(resB.projections).toHaveLength(30);

    // Concrete cross-contamination check: no recurring/installment event from
    // User A may carry User B's source row id (`b-rec-*` / `b-inst-*`) and
    // vice versa. This is the strongest single-call assertion against AV-7 —
    // if module-local state were re-introduced, events would leak across
    // calls and these prefixes would mix. Baseline events have no sourceId
    // (they are pure aggregates), so we filter them out.
    const sourcedA = resA.projections.flatMap((d) =>
      d.events.filter((e): e is typeof e & { sourceId: string } => e.sourceId !== undefined),
    );
    const sourcedB = resB.projections.flatMap((d) =>
      d.events.filter((e): e is typeof e & { sourceId: string } => e.sourceId !== undefined),
    );
    for (const event of sourcedA) {
      expect(event.sourceId).not.toMatch(/^b-/);
    }
    for (const event of sourcedB) {
      expect(event.sourceId).not.toMatch(/^a-/);
    }
    // Sanity: each user must have at least one sourced event (recurring or
    // installment) — otherwise a no-op pass would satisfy the prefix check.
    expect(sourcedA.length).toBeGreaterThan(0);
    expect(sourcedB.length).toBeGreaterThan(0);
  });

  it('repeated parallel batches stay deterministic (no leftover state across batches)', async () => {
    // Three back-to-back Promise.all batches — if any module-local cache leaks
    // between calls, later batches would diverge from the first.
    const runBatch = async (): Promise<[number, number]> => {
      const [a, b] = await Promise.all([
        forecastCashflow(makeSupabase(makeUserAFixture()), 'user-a', 30, {
          now: NOW,
          skipFx: true,
        }),
        forecastCashflow(makeSupabase(makeUserBFixture()), 'user-b', 30, {
          now: NOW,
          skipFx: true,
        }),
      ]);
      return [
        a.projections.flatMap((d) => d.events).length,
        b.projections.flatMap((d) => d.events).length,
      ];
    };

    const batch1 = await runBatch();
    const batch2 = await runBatch();
    const batch3 = await runBatch();

    expect(batch2).toEqual(batch1);
    expect(batch3).toEqual(batch1);
  });
});
