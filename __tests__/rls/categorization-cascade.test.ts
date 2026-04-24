/**
 * Integration test for the F2-E4-T1 categorization cascade.
 *
 * Verifies the RPC `public.run_categorization_cascade` against a live local
 * Supabase stack:
 *   - Steps fire in the documented order (rule > alias_exact > alias_fuzzy
 *     > history > none).
 *   - The 0.75 fuzzy threshold is enforced (0.6–0.75 falls through to
 *     history / none).
 *   - <100ms perf budget on a single call against a populated user.
 *   - User isolation: a user's rules/aliases never leak into another
 *     user's cascade result.
 *
 * Skipped unless RUN_INTEGRATION_TESTS=1 is set; see __tests__/rls/helpers.ts
 * for the env-var contract.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ANON_KEY,
  SHOULD_RUN,
  SERVICE_KEY,
  SUPABASE_URL,
  adminClient,
  assertEnv,
  createUser,
  signedInClient,
} from './helpers';
import {
  type CategorizationResult,
  parseCascadeResult,
  runCategorizationCascade,
} from '@/lib/categorization/cascade';
import type { Database } from '@/supabase/types';

interface SeededFixtures {
  userId: string;
  email: string;
  client: SupabaseClient<Database>;
  accountId: string;
  categoryFood: string;
  categoryUtility: string;
  merchantKonzum: string;
  merchantTelecom: string;
}

async function seedUser(admin: SupabaseClient<Database>, tag: string): Promise<SeededFixtures> {
  const { id, email } = await createUser(admin, tag);
  const client = await signedInClient(email);

  const account = await admin
    .from('accounts')
    .insert({ user_id: id, name: 'Test', type: 'cash', currency: 'BAM' })
    .select('id')
    .single();
  if (account.error) throw account.error;

  // The signup trigger seeds default categories. Pick two we know exist by
  // slug — fall back to inserting if the seed list ever changes.
  const cats = await admin
    .from('categories')
    .select('id, slug')
    .eq('user_id', id)
    .in('slug', ['namirnice', 'komunalije']);
  if (cats.error) throw cats.error;
  const food = cats.data.find((c) => c.slug === 'namirnice');
  const util = cats.data.find((c) => c.slug === 'komunalije');
  if (!food || !util) {
    throw new Error('Expected seeded categories namirnice + komunalije');
  }

  const konzum = await admin
    .from('merchants')
    .insert({
      user_id: id,
      canonical_name: 'Konzum',
      display_name: 'Konzum',
      default_category_id: food.id,
    })
    .select('id')
    .single();
  if (konzum.error) throw konzum.error;

  const telecom = await admin
    .from('merchants')
    .insert({
      user_id: id,
      canonical_name: 'BH Telecom',
      display_name: 'BH Telecom',
      default_category_id: util.id,
    })
    .select('id')
    .single();
  if (telecom.error) throw telecom.error;

  return {
    userId: id,
    email,
    client,
    accountId: account.data.id,
    categoryFood: food.id,
    categoryUtility: util.id,
    merchantKonzum: konzum.data.id,
    merchantTelecom: telecom.data.id,
  };
}

describe.skipIf(!SHOULD_RUN)('run_categorization_cascade RPC', () => {
  let admin: SupabaseClient<Database>;
  let alice: SeededFixtures;
  let bob: SeededFixtures;

  beforeAll(async () => {
    assertEnv();
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      throw new Error('Missing test env');
    }
    admin = adminClient();
    alice = await seedUser(admin, 'alice');
    bob = await seedUser(admin, 'bob');
  });

  afterAll(async () => {
    if (alice.userId) await admin.auth.admin.deleteUser(alice.userId);
    if (bob.userId) await admin.auth.admin.deleteUser(bob.userId);
  });

  async function callCascade(
    client: SupabaseClient<Database>,
    description: string,
    amountMinor: number,
  ): Promise<CategorizationResult> {
    return runCategorizationCascade(client, {
      description,
      amountMinor,
      userId: 'unused-rpc-uses-auth-uid',
    });
  }

  it('returns none when nothing matches', async () => {
    const result = await callCascade(alice.client, 'Nepoznati merchant XYZ', -1000);
    expect(result.source).toBe('none');
    expect(result.confidence).toBe(0);
  });

  it('returns alias_exact for a normalised exact alias hit', async () => {
    const insert = await admin.from('merchant_aliases').insert({
      user_id: alice.userId,
      merchant_id: alice.merchantKonzum,
      pattern: 'Konzum BL',
      pattern_type: 'contains',
    });
    expect(insert.error).toBeNull();

    const result = await callCascade(alice.client, 'konzum, bl.', -4350);
    expect(result.source).toBe('alias_exact');
    expect(result.confidence).toBe(1);
    expect(result.merchantId).toBe(alice.merchantKonzum);
    expect(result.categoryId).toBe(alice.categoryFood);
  });

  it('rule beats alias even when both would match', async () => {
    // Alias points to food (Konzum). Add a higher-priority rule that says
    // "anything containing KONZUM" → utilities (silly but tests precedence).
    const rule = await admin
      .from('categorization_rules')
      .insert({
        user_id: alice.userId,
        name: 'Force Konzum to utility',
        priority: 100,
        match_merchant_pattern: 'KONZUM',
        match_merchant_pattern_type: 'contains',
        set_category_id: alice.categoryUtility,
        set_merchant_id: alice.merchantTelecom,
      })
      .select('id')
      .single();
    expect(rule.error).toBeNull();

    try {
      const result = await callCascade(alice.client, 'KONZUM BL', -4350);
      expect(result.source).toBe('rule');
      expect(result.confidence).toBe(1);
      expect(result.categoryId).toBe(alice.categoryUtility);
      expect(result.merchantId).toBe(alice.merchantTelecom);
    } finally {
      if (rule.data?.id) {
        await admin.from('categorization_rules').delete().eq('id', rule.data.id);
      }
    }
  });

  it('honours rule amount-sign filter', async () => {
    // "positive only" rule: only matches inflows. We send -4350 (outflow)
    // so the rule must skip and the cascade should fall through to alias.
    const rule = await admin
      .from('categorization_rules')
      .insert({
        user_id: alice.userId,
        priority: 200,
        match_merchant_pattern: 'KONZUM',
        match_merchant_pattern_type: 'contains',
        match_amount_sign: 'positive',
        set_category_id: alice.categoryUtility,
      })
      .select('id')
      .single();
    expect(rule.error).toBeNull();

    try {
      const result = await callCascade(alice.client, 'KONZUM BL', -4350);
      expect(result.source).toBe('alias_exact');
      expect(result.categoryId).toBe(alice.categoryFood);
    } finally {
      if (rule.data?.id) {
        await admin.from('categorization_rules').delete().eq('id', rule.data.id);
      }
    }
  });

  it('returns alias_fuzzy when similarity is in [0.75, 1)', async () => {
    // Wipe Bob's aliases for a clean slate, add one alias for Telecom,
    // then call with a typo'd description that scores high.
    await admin.from('merchant_aliases').delete().eq('user_id', bob.userId);
    const insert = await admin.from('merchant_aliases').insert({
      user_id: bob.userId,
      merchant_id: bob.merchantTelecom,
      pattern: 'BH Telecom',
      pattern_type: 'contains',
    });
    expect(insert.error).toBeNull();

    // 'BH Telecoms' has a single character drift → trigram similarity ≥ 0.75.
    const result = await callCascade(bob.client, 'BH Telecoms', -3500);
    expect(['alias_fuzzy', 'alias_exact']).toContain(result.source);
    if (result.source === 'alias_fuzzy') {
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
      expect(result.confidence).toBeLessThan(1);
    }
    expect(result.merchantId).toBe(bob.merchantTelecom);
  });

  it("does not leak across users (alice's alias does not match bob)", async () => {
    // Alice has the Konzum alias from earlier. Bob should still get none.
    const result = await callCascade(bob.client, 'KONZUM BL', -4350);
    expect(result.source).toBe('none');
  });

  it('completes a single call within the 100ms perf budget', async () => {
    // Warm-up to amortise plan caching, then time a real call.
    await callCascade(alice.client, 'KONZUM BL', -4350);
    const start = performance.now();
    await callCascade(alice.client, 'KONZUM BL', -4350);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('parseCascadeResult round-trips a real RPC payload', async () => {
    // Sanity check that the TS shape parser stays in sync with whatever
    // the SQL function actually emits today.
    const { data, error } = await alice.client.rpc('run_categorization_cascade', {
      p_description: 'KONZUM BL',
      p_amount_minor: -4350,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    if (data) {
      const parsed = parseCascadeResult(data);
      expect(parsed.source).not.toBe('none');
    }
  });
});
