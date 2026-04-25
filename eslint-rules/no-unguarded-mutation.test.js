/**
 * Unit tests for the no-unguarded-mutation ESLint rule.
 *
 * Run with:  node --experimental-vm-modules node_modules/.bin/vitest run eslint-rules/
 * Or simply: pnpm test (vitest picks up *.test.js in the project root)
 */

import { RuleTester } from 'eslint';
import rule from './no-unguarded-mutation.js';

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-unguarded-mutation', rule, {
  valid: [
    // ── Guarded: eq('user_id') present ──────────────────────────────────────
    {
      name: 'update with eq user_id',
      code: `supabase.from('transactions').update({ note: 'x' }).eq('user_id', uid).eq('id', id)`,
    },
    {
      name: 'delete with eq user_id',
      code: `supabase.from('accounts').delete().eq('user_id', uid)`,
    },
    {
      name: 'upsert with eq user_id',
      code: `supabase.from('categories').upsert({ name: 'y' }).eq('user_id', uid)`,
    },
    {
      name: 'eq user_id can appear before mutation method',
      code: `supabase.from('merchants').eq('user_id', uid).update({ name: 'z' })`,
    },
    {
      name: 'chained single() does not confuse chain detection',
      code: `
        const { data } = await supabase
          .from('budgets')
          .update({ amount: 100 })
          .eq('id', id)
          .eq('user_id', uid)
          .single();
      `,
    },

    // ── Tables not in USER_OWNED_TABLES ─────────────────────────────────────
    {
      name: 'profiles uses id not user_id — excluded from rule',
      code: `supabase.from('profiles').update({ name: 'a' }).eq('id', uid)`,
    },
    {
      name: 'fx_rates excluded',
      code: `supabase.from('fx_rates').upsert({ base: 'EUR', rate: 1.95 })`,
    },
    {
      name: 'installment_occurrences excluded',
      code: `supabase.from('installment_occurrences').update({ state: 'posted' }).eq('id', occId)`,
    },

    // ── INSERT is not a mutation under this rule ─────────────────────────────
    {
      name: 'insert is not a mutation (ownership set via payload)',
      code: `supabase.from('transactions').insert({ user_id: uid, amount: 100 })`,
    },

    // ── SELECT-only chains ───────────────────────────────────────────────────
    {
      name: 'select chain without mutation',
      code: `supabase.from('transactions').select('id').eq('user_id', uid)`,
    },
  ],

  invalid: [
    // ── Missing eq('user_id') on a user-owned table ──────────────────────────
    {
      name: 'update without eq user_id',
      code: `supabase.from('transactions').update({ note: 'x' }).eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'delete without eq user_id',
      code: `supabase.from('accounts').delete().eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'upsert without eq user_id',
      code: `supabase.from('categories').upsert({ name: 'y' }).eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'update with eq on a different column only',
      code: `supabase.from('merchants').update({ x: 1 }).eq('batch_id', b)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'only one error per full chain (not per sub-call)',
      code: `
        const r = supabase
          .from('budgets')
          .update({ amount: 1 })
          .eq('id', x)
          .single();
      `,
      errors: 1,
    },
    {
      name: 'goals table also covered',
      code: `supabase.from('goals').delete().eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'receipt_scans table covered',
      code: `supabase.from('receipt_scans').update({ status: 'processing' }).eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
    {
      name: 'installment_plans table covered',
      code: `supabase.from('installment_plans').update({ status: 'completed' }).eq('id', id)`,
      errors: [{ messageId: 'missingUserIdEq' }],
    },
  ],
});

console.log('no-unguarded-mutation: all tests passed ✓');
