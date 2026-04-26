/**
 * Integration tests for get_monthly_summary: opening_balance category must not
 * affect month income, expense, net, or average daily spend.
 *
 * Local Supabase: `supabase start` and `supabase db reset` so migration 00038
 * (and prior) is applied. Then (PowerShell 7+):
 *
 *   $env:RUN_INTEGRATION_TESTS = '1'
 *   $env:SUPABASE_URL_TEST = 'http://127.0.0.1:54321'
 *   $env:SUPABASE_ANON_KEY_TEST = '<from supabase status>'
 *   $env:SUPABASE_SERVICE_KEY_TEST = '<service_role from supabase status>'
 *   pnpm test -- __tests__/rpc/get-monthly-summary.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1';

const SUPABASE_URL = process.env.SUPABASE_URL_TEST ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY_TEST ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_TEST ?? '';

function uniqueEmail(tag: string): string {
  return `qa-${tag}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@konto.local`;
}

function jsonBigInt(r: unknown, k: string): bigint {
  if (r === null || typeof r !== 'object' || Array.isArray(r)) {
    return 0n;
  }
  const v = (r as Record<string, unknown>)[k];
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return BigInt(Math.trunc(v));
  }
  return 0n;
}

const TEST_Y = 2026;
const TEST_M = 6;
const TRX_DATE = '2026-06-10';
const P_TODAY = '2026-06-15';

describe.skipIf(!shouldRun)('get_monthly_summary (opening_balance excluded from flow)', () => {
  let admin: SupabaseClient<Database>;
  let client: SupabaseClient<Database>;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      throw new Error(
        'Integration test requires SUPABASE_URL_TEST, SUPABASE_ANON_KEY_TEST, SUPABASE_SERVICE_KEY_TEST.',
      );
    }

    admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const password = 'qa-test-password-12345';
    const create = await admin.auth.admin.createUser({
      email: uniqueEmail('summary'),
      password,
      email_confirm: true,
    });
    if (create.error) throw create.error;
    userId = create.data.user.id;

    const acc = await admin
      .from('accounts')
      .insert({ user_id: userId, name: 'QA cash', type: 'cash', currency: 'BAM' })
      .select('id')
      .single();
    if (acc.error) throw acc.error;
    accountId = acc.data.id;

    client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signIn = await client.auth.signInWithPassword({
      email: create.data.user.email ?? '',
      password,
    });
    if (signIn.error) throw signIn.error;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('excludes large positive opening balance from month_income; keeps real expense', async () => {
    const ob = await client
      .from('categories')
      .select('id')
      .eq('slug', 'opening_balance')
      .maybeSingle();
    if (ob.error) throw ob.error;
    if (!ob.data) throw new Error('missing opening_balance category');

    const food = await client
      .from('categories')
      .select('id')
      .eq('slug', 'hrana-i-pice')
      .maybeSingle();
    if (food.error) throw food.error;
    if (!food.data) throw new Error('missing hrana-i-pice category');

    const baseRow = {
      user_id: userId,
      account_id: accountId,
      original_currency: 'BAM' as const,
      base_currency: 'BAM' as const,
      transaction_date: TRX_DATE,
      source: 'manual' as const,
      category_source: 'user' as const,
      fx_rate: 1,
      fx_rate_date: TRX_DATE,
    };

    const { error: e1 } = await client.from('transactions').insert({
      ...baseRow,
      original_amount_cents: 1_000_000,
      base_amount_cents: 1_000_000,
      account_ledger_cents: 1_000_000,
      category_id: ob.data.id,
      description: 'Početno stanje',
    });
    expect(e1).toBeNull();

    const { error: e2 } = await client.from('transactions').insert({
      ...baseRow,
      original_amount_cents: -10_000,
      base_amount_cents: -10_000,
      account_ledger_cents: -10_000,
      category_id: food.data.id,
      description: 'Namirnice',
    });
    expect(e2).toBeNull();

    const { data, error } = await client.rpc('get_monthly_summary', {
      p_year: TEST_Y,
      p_month: TEST_M,
      p_base_currency: 'BAM',
      p_today_date: P_TODAY,
    });
    expect(error).toBeNull();
    if (data === null) throw new Error('null rpc data');

    expect(jsonBigInt(data, 'month_income')).toBe(0n);
    expect(jsonBigInt(data, 'month_expense')).toBe(10_000n);
    expect(jsonBigInt(data, 'month_net')).toBe(-10_000n);
  });

  it('excludes negative opening balance (debt) from month_expense; keeps other expense', async () => {
    const password2 = 'qa-test-password-12345';
    const create = await admin.auth.admin.createUser({
      email: uniqueEmail('summary2'),
      password: password2,
      email_confirm: true,
    });
    if (create.error) throw create.error;
    const u2 = create.data.user.id;

    const c2 = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signIn = await c2.auth.signInWithPassword({
      email: create.data.user.email ?? '',
      password: password2,
    });
    if (signIn.error) throw signIn.error;

    try {
      const acc = await admin
        .from('accounts')
        .insert({ user_id: u2, name: 'QA card', type: 'credit_card', currency: 'BAM' })
        .select('id')
        .single();
      if (acc.error) throw acc.error;
      const acc2 = acc.data.id;

      const ob = await c2
        .from('categories')
        .select('id')
        .eq('slug', 'opening_balance')
        .maybeSingle();
      const food = await c2
        .from('categories')
        .select('id')
        .eq('slug', 'hrana-i-pice')
        .maybeSingle();
      if (ob.error || !ob.data) throw new Error('opening_balance');
      if (food.error || !food.data) throw new Error('hrana-i-pice');

      const baseRow = {
        user_id: u2,
        account_id: acc2,
        original_currency: 'BAM' as const,
        base_currency: 'BAM' as const,
        transaction_date: TRX_DATE,
        source: 'manual' as const,
        category_source: 'user' as const,
        fx_rate: 1,
        fx_rate_date: TRX_DATE,
      };

      const { error: o1 } = await c2.from('transactions').insert({
        ...baseRow,
        original_amount_cents: -50_000,
        base_amount_cents: -50_000,
        account_ledger_cents: -50_000,
        category_id: ob.data.id,
        description: 'Početno stanje',
      });
      expect(o1).toBeNull();

      const { error: o2 } = await c2.from('transactions').insert({
        ...baseRow,
        original_amount_cents: -2_000,
        base_amount_cents: -2_000,
        account_ledger_cents: -2_000,
        category_id: food.data.id,
      });
      expect(o2).toBeNull();

      const { data, error } = await c2.rpc('get_monthly_summary', {
        p_year: TEST_Y,
        p_month: TEST_M,
        p_base_currency: 'BAM',
        p_today_date: P_TODAY,
      });
      expect(error).toBeNull();
      if (data === null) throw new Error('null rpc data');

      expect(jsonBigInt(data, 'month_income')).toBe(0n);
      expect(jsonBigInt(data, 'month_expense')).toBe(2_000n);
      expect(jsonBigInt(data, 'month_net')).toBe(-2_000n);
    } finally {
      await admin.auth.admin.deleteUser(u2);
    }
  });
});
