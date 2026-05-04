/**
 * RLS for public.installment_plans (F4-E1-T1).
 *
 * Requires a parent account (FK). The matrix's payloadFor seeds one via
 * the admin client.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('installment_plans RLS', () => {
  registerRlsMatrix({
    tableName: 'installment_plans',
    payloadFor: async (userId, admin) => {
      const acc = await admin
        .from('accounts')
        .insert({
          user_id: userId,
          name: `QA inst acc ${String(Date.now())}`,
          type: 'credit_card',
          currency: 'BAM',
        })
        .select('id')
        .single();
      if (acc.error) throw acc.error;
      return {
        user_id: userId,
        account_id: acc.data.id,
        currency: 'BAM',
        total_cents: 100_000,
        installment_cents: 10_000,
        installment_count: 10,
        day_of_month: 15,
        start_date: '2026-01-01',
        status: 'active',
      };
    },
    updateField: { column: 'status', value: 'cancelled' },
  });
});
