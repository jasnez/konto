// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countActiveInsights,
  listInsights,
  type InsightsSupabaseClient,
} from './insights';

interface CapturedCall {
  table: string;
  selectArgs: unknown[];
  eqArgs: unknown[][];
  isArgs: unknown[][];
  notArgs: unknown[][];
  orArgs: string[];
  orderArgs: { column: string; opts: unknown }[];
  limitArgs: number[];
}

interface FluentResult<T> {
  data: T;
  error: { message: string } | null;
  count?: number | null;
}

function makeFluent<T>(result: FluentResult<T>, captured: CapturedCall) {
  const chain = {
    select: (...args: unknown[]) => {
      captured.selectArgs.push(...args);
      return chain;
    },
    eq: (col: string, val: unknown) => {
      captured.eqArgs.push([col, val]);
      return chain;
    },
    is: (col: string, val: unknown) => {
      captured.isArgs.push([col, val]);
      return chain;
    },
    not: (col: string, op: string, val: unknown) => {
      captured.notArgs.push([col, op, val]);
      return chain;
    },
    or: (filter: string) => {
      captured.orArgs.push(filter);
      return chain;
    },
    order: (column: string, opts: unknown) => {
      captured.orderArgs.push({ column, opts });
      return chain;
    },
    limit: (n: number) => {
      captured.limitArgs.push(n);
      return chain;
    },
    then: (resolve: (v: FluentResult<T>) => void) => {
      resolve(result);
    },
  };
  return chain;
}

function makeStub<T>(result: FluentResult<T>) {
  const captured: CapturedCall = {
    table: '',
    selectArgs: [],
    eqArgs: [],
    isArgs: [],
    notArgs: [],
    orArgs: [],
    orderArgs: [],
    limitArgs: [],
  };
  const supabase = {
    from: vi.fn((table: string) => {
      captured.table = table;
      return makeFluent(result, captured);
    }),
  } as unknown as InsightsSupabaseClient;
  return { supabase, captured };
}

const USER_ID = 'u-test';
const NOW = new Date('2026-05-04T12:00:00Z');

const RAW_ROW = {
  id: 'i-1',
  type: 'category_anomaly',
  severity: 'warning',
  title: 'Hrana viša 50%',
  body: '**Hrana** je u aprilu bila 50% viša',
  action_url: '/transakcije?category=cat-1',
  metadata: { categoryId: 'cat-1' },
  valid_until: '2026-05-18T00:00:00Z',
  dismissed_at: null,
  created_at: '2026-05-01T00:00:00Z',
};

describe('listInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped rows for active mode with severity-DESC sort', async () => {
    const { supabase, captured } = makeStub({
      data: [
        { ...RAW_ROW, id: 'i-info', severity: 'info', created_at: '2026-05-03T00:00:00Z' },
        { ...RAW_ROW, id: 'i-alert', severity: 'alert', created_at: '2026-05-01T00:00:00Z' },
        { ...RAW_ROW, id: 'i-warn', severity: 'warning', created_at: '2026-05-02T00:00:00Z' },
      ],
      error: null,
    });

    const out = await listInsights(supabase, USER_ID, { mode: 'active', now: NOW });

    expect(out.map((r) => r.id)).toEqual(['i-alert', 'i-warn', 'i-info']);
    expect(captured.table).toBe('insights');
    expect(captured.eqArgs).toContainEqual(['user_id', USER_ID]);
    expect(captured.isArgs).toContainEqual(['dismissed_at', null]);
    expect(captured.orArgs[0]).toContain('valid_until.is.null');
    expect(captured.orArgs[0]).toContain('valid_until.gt.');
  });

  it('orders archived rows by dismissed_at DESC server-side', async () => {
    const { supabase, captured } = makeStub({
      data: [{ ...RAW_ROW, dismissed_at: '2026-04-30T00:00:00Z' }],
      error: null,
    });
    await listInsights(supabase, USER_ID, { mode: 'archived', now: NOW });

    expect(captured.notArgs).toContainEqual(['dismissed_at', 'is', null]);
    expect(captured.orderArgs[0]).toEqual({
      column: 'dismissed_at',
      opts: { ascending: false },
    });
  });

  it('drops rows with unknown type or severity (defensive)', async () => {
    const { supabase } = makeStub({
      data: [
        RAW_ROW,
        { ...RAW_ROW, id: 'i-unknown', type: 'future_detector_id' },
        { ...RAW_ROW, id: 'i-bad-severity', severity: 'critical' },
      ],
      error: null,
    });
    const out = await listInsights(supabase, USER_ID, { mode: 'active', now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('i-1');
  });

  it('returns empty array on supabase error', async () => {
    const { supabase } = makeStub({ data: null as never, error: { message: 'PG error' } });
    const out = await listInsights(supabase, USER_ID, { mode: 'active' });
    expect(out).toEqual([]);
  });

  it('respects limit option', async () => {
    const { supabase, captured } = makeStub({ data: [], error: null });
    await listInsights(supabase, USER_ID, { mode: 'active', limit: 3 });
    expect(captured.limitArgs).toContain(3);
  });

  it('coerces missing metadata to empty object', async () => {
    const { supabase } = makeStub({
      data: [{ ...RAW_ROW, metadata: null }],
      error: null,
    });
    const out = await listInsights(supabase, USER_ID, { mode: 'active' });
    expect(out[0].metadata).toEqual({});
  });
});

describe('countActiveInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count from supabase HEAD response', async () => {
    const { supabase, captured } = makeStub({ data: null, error: null, count: 7 });
    const n = await countActiveInsights(supabase, USER_ID, { now: NOW });
    expect(n).toBe(7);
    expect(captured.selectArgs).toContainEqual({ count: 'exact', head: true });
  });

  it('returns 0 when count is null', async () => {
    const { supabase } = makeStub({ data: null, error: null, count: null });
    const n = await countActiveInsights(supabase, USER_ID);
    expect(n).toBe(0);
  });

  it('returns 0 on error', async () => {
    const { supabase } = makeStub({
      data: null,
      error: { message: 'PG error' },
      count: null,
    });
    const n = await countActiveInsights(supabase, USER_ID);
    expect(n).toBe(0);
  });
});
