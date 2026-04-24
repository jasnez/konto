/**
 * fx_rates write-deny (migration 00016).
 *
 * Reads are open to everyone (shared rate cache). Writes are REVOKE'd from
 * `authenticated` and `anon` — only service_role can write. This test pins
 * both halves of that contract so a future permissive policy or owner change
 * would fail CI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import { SHOULD_RUN, adminClient, assertEnv, createUser, signedInClient } from './helpers';

describe.skipIf(!SHOULD_RUN)('fx_rates write-deny RLS (00016)', () => {
  let admin: SupabaseClient<Database>;
  let clientA: SupabaseClient<Database>;
  let userAId: string;

  beforeAll(async () => {
    assertEnv();
    admin = adminClient();

    const a = await createUser(admin, 'fx-a');
    userAId = a.id;
    clientA = await signedInClient(a.email);

    // Seed a rate via service role so UPDATE/DELETE have a target.
    await admin
      .from('fx_rates')
      .upsert(
        { base: 'EUR', quote: 'BAM', rate: 1.95583, date: '2026-04-01' },
        { onConflict: 'date,base,quote' },
      );
  });

  afterAll(async () => {
    if (userAId) await admin.auth.admin.deleteUser(userAId);
  });

  it('authenticated user can SELECT fx_rates (read stays open)', async () => {
    const res = await clientA.from('fx_rates').select('base, quote, rate').limit(1);
    expect(res.error).toBeNull();
  });

  it('authenticated user cannot INSERT fx_rates (REVOKE)', async () => {
    const ins = await clientA
      .from('fx_rates')
      .insert({ base: 'USD', quote: 'BAM', rate: 1.8, date: '2026-04-01' });
    expect(ins.error).not.toBeNull();
    expect(ins.error?.message.toLowerCase()).toMatch(
      /permission|denied|row-level security|violates/,
    );
  });

  it('authenticated user cannot UPDATE fx_rates (REVOKE)', async () => {
    const upd = await clientA
      .from('fx_rates')
      .update({ rate: 9.99 })
      .eq('base', 'EUR')
      .eq('quote', 'BAM')
      .select('base');
    // Either hard permission error, or 0 rows affected — both are acceptable deny signals.
    if (upd.error) {
      expect(upd.error.message.toLowerCase()).toMatch(
        /permission|denied|row-level security|violates/,
      );
    } else {
      expect(upd.data).toEqual([]);
    }

    const check = await admin
      .from('fx_rates')
      .select('rate')
      .eq('base', 'EUR')
      .eq('quote', 'BAM')
      .eq('date', '2026-04-01')
      .single();
    expect(check.data?.rate).toBe(1.95583);
  });

  it('authenticated user cannot DELETE fx_rates (REVOKE)', async () => {
    const del = await clientA
      .from('fx_rates')
      .delete()
      .eq('base', 'EUR')
      .eq('quote', 'BAM')
      .select('base');
    if (del.error) {
      expect(del.error.message.toLowerCase()).toMatch(
        /permission|denied|row-level security|violates/,
      );
    } else {
      expect(del.data).toEqual([]);
    }

    const check = await admin
      .from('fx_rates')
      .select('base')
      .eq('base', 'EUR')
      .eq('quote', 'BAM')
      .eq('date', '2026-04-01')
      .single();
    expect(check.data?.base).toBe('EUR');
  });
});
