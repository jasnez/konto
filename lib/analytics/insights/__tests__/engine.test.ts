// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { generateInsights } from '../engine';
import type { Detector } from '../types';

// We mock the full ALL_DETECTORS list so the test isn't coupled to any
// detector's specific output. This focuses the engine test on orchestration:
// dedup, error swallowing, batch insert, cold-start guard.
//
// vi.hoisted() ensures the detector references survive the module hoist
// that vi.mock applies — without it, `goodDetector` is undefined when the
// mock factory runs.
const mocks = vi.hoisted(() => {
  const good: Detector = {
    id: 'good',
    label: 'Good',
    run: () => [
      {
        type: 'good',
        severity: 'info',
        title: 'Good',
        body: 'A good insight',
        dedupKey: 'good:1',
      },
      {
        type: 'good',
        severity: 'info',
        title: 'Already live',
        body: 'This will be deduped',
        dedupKey: 'good:already-live',
      },
    ],
  };
  const throwing: Detector = {
    id: 'throwing',
    label: 'Throwing',
    run: () => {
      throw new Error('boom');
    },
  };
  return { goodDetector: good, throwingDetector: throwing };
});

vi.mock('../detectors', () => ({
  ALL_DETECTORS: [mocks.goodDetector, mocks.throwingDetector],
}));

// Mock query helpers — we don't need realistic data, just non-empty.
vi.mock('@/lib/queries/budgets', () => ({
  listBudgetsWithSpent: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/queries/recurring', () => ({
  listActiveRecurring: vi.fn(() => Promise.resolve([])),
}));

// ─── Fluent supabase stub ─────────────────────────────────────────────────────

interface FromCalls {
  txs: unknown[];
  accounts: { id: string; name: string; currency: string; current_balance_cents: number }[];
  insights: { dedup_key: string }[];
  profile: { base_currency: string } | null;
  insightInsertPayload: unknown;
  insightInsertResult: { data: { id: string }[] | null; error: { message: string } | null };
}

interface Terminal {
  data: unknown;
  error: { message: string } | null;
}

interface FluentChain {
  select: () => FluentChain;
  eq: () => FluentChain;
  is: () => FluentChain;
  in: () => FluentChain;
  or: () => FluentChain;
  gte: () => FluentChain;
  lt: () => FluentChain;
  order: () => FluentChain;
  limit: () => FluentChain;
  maybeSingle: () => Promise<Terminal>;
  single: () => Promise<Terminal>;
  then: (resolve: (v: Terminal) => void) => void;
}

function makeFluent(terminal: Terminal): FluentChain {
  const chain: FluentChain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    or: () => chain,
    gte: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    then: (resolve) => {
      resolve(terminal);
    },
  };
  return chain;
}

function makeSupabaseStub(calls: FromCalls): SupabaseClient<Database> {
  return {
    from: vi.fn((table: string) => {
      if (table === 'transactions') {
        return makeFluent({ data: calls.txs, error: null });
      }
      if (table === 'accounts') {
        return makeFluent({ data: calls.accounts, error: null });
      }
      if (table === 'profiles') {
        return makeFluent({ data: calls.profile, error: null });
      }
      if (table === 'insights') {
        return {
          select: () => makeFluent({ data: calls.insights, error: null }),
          insert: (rows: unknown) => {
            calls.insightInsertPayload = rows;
            return makeFluent(calls.insightInsertResult);
          },
          // MT-12 (Low): engine pre-deletes expired-with-same-key before
          // batch insert. Mock just returns no-op success — none of these
          // tests are asserting on the preclean call shape.
          delete: () => makeFluent({ data: null, error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: vi.fn(),
  } as unknown as SupabaseClient<Database>;
}

// Synthetic transactions for cold-start guard (need ≥ 30 to not skip).
function buildTxs(n: number): unknown[] {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: `tx-${String(i)}`,
      transaction_date: '2026-04-15',
      base_amount_cents: -1000,
      currency: 'BAM',
      category_id: null,
      recurring_id: null,
      merchants: null,
      categories: null,
    });
  }
  return out;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateInsights', () => {
  let calls: FromCalls;

  beforeEach(() => {
    vi.clearAllMocks();
    calls = {
      txs: buildTxs(40),
      accounts: [{ id: 'a1', name: 'Glavni', currency: 'BAM', current_balance_cents: 1000 }],
      insights: [],
      profile: { base_currency: 'BAM' },
      insightInsertPayload: null,
      insightInsertResult: { data: [{ id: 'i1' }], error: null },
    };
  });

  it('returns early on cold-start (< 30 transactions)', async () => {
    calls.txs = buildTxs(10);
    const stub = makeSupabaseStub(calls);
    const result = await generateInsights(stub, 'user-1', new Date('2026-05-04T00:00:00Z'));
    expect(result.created).toBe(0);
    expect(result.byDetector).toEqual({});
  });

  it('runs all detectors and inserts non-deduped insights', async () => {
    const stub = makeSupabaseStub(calls);
    const result = await generateInsights(stub, 'user-1', new Date('2026-05-04T00:00:00Z'));

    // good emitted 2, no live keys → both fresh
    expect(result.byDetector.good.created).toBe(2);
    expect(result.byDetector.good.skipped).toBe(0);
    // throwing detector marked errored
    expect(result.byDetector.throwing.errored).toBe(true);
    expect(result.errored).toBe(1);
    // 2 inserted (assuming insert response says 1 — but our mock returns
    // { data: [{ id: 'i1' }] } so result.created = 1).
    expect(result.created).toBe(1);
    expect(calls.insightInsertPayload).toBeTruthy();
  });

  it('filters out insights whose dedup_key is already live', async () => {
    calls.insights = [{ dedup_key: 'good:already-live' }];
    const stub = makeSupabaseStub(calls);
    const result = await generateInsights(stub, 'user-1', new Date('2026-05-04T00:00:00Z'));
    expect(result.byDetector.good.created).toBe(1);
    expect(result.byDetector.good.skipped).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('continues running other detectors when one throws', async () => {
    const stub = makeSupabaseStub(calls);
    const result = await generateInsights(stub, 'user-1', new Date('2026-05-04T00:00:00Z'));
    expect(result.byDetector.good.created).toBe(2);
    expect(result.byDetector.throwing.errored).toBe(true);
  });

  it('handles insert failure gracefully (created → 0)', async () => {
    calls.insightInsertResult = { data: null, error: { message: 'PG error' } };
    const stub = makeSupabaseStub(calls);
    const result = await generateInsights(stub, 'user-1', new Date('2026-05-04T00:00:00Z'));
    expect(result.created).toBe(0);
    expect(result.byDetector.good.created).toBe(2); // detector still tallied locally
  });
});
