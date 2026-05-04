/**
 * RLS for public.merchant_aliases (F4-E1-T1).
 *
 * Requires a parent merchant. WITH CHECK uses `user_owns_merchant(merchant_id)`,
 * so the cross-user INSERT test fires either the user_id mismatch OR the
 * merchant ownership helper.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('merchant_aliases RLS', () => {
  registerRlsMatrix({
    tableName: 'merchant_aliases',
    payloadFor: async (userId, admin) => {
      const stamp = `${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`;
      const m = await admin
        .from('merchants')
        .insert({
          user_id: userId,
          // merchants schema (00006): canonical_name + display_name (both NOT NULL).
          canonical_name: `qa-m-${stamp}`,
          display_name: `QA M ${stamp}`,
        })
        .select('id')
        .single();
      if (m.error) throw m.error;
      return {
        user_id: userId,
        merchant_id: m.data.id,
        pattern: `qa-pattern-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
        pattern_type: 'exact',
      };
    },
    updateField: { column: 'pattern', value: 'updated' },
  });
});
