/**
 * RLS for public.budgets (F4-E1-T1).
 *
 * Budgets reference categories via FK with a `user_owns_budgetable_category`
 * helper in the WITH CHECK clause. The matrix's cross-user INSERT test
 * therefore fires both gates: the user_id mismatch AND the FK ownership
 * helper. Either failing is sufficient — we just assert the insert errors.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('budgets RLS', () => {
  registerRlsMatrix({
    tableName: 'budgets',
    payloadFor: async (userId, admin) => {
      // Seed a category owned by the same user — budgets.WITH CHECK
      // requires `user_owns_budgetable_category(category_id)`.
      const cat = await admin
        .from('categories')
        .insert({
          user_id: userId,
          name: `qa-budget-cat-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
          slug: `qa-budget-cat-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
          kind: 'expense',
        })
        .select('id')
        .single();
      if (cat.error) throw cat.error;
      return {
        user_id: userId,
        category_id: cat.data.id,
        amount_cents: 50_000,
        currency: 'BAM',
        period: 'monthly',
      };
    },
    updateField: { column: 'amount_cents', value: 99_999 },
  });
});
