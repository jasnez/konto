/**
 * RLS for public.recurring_transactions (F4-E1-T1).
 *
 * No required FKs — merchant_id, category_id, account_id are all nullable.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('recurring_transactions RLS', () => {
  registerRlsMatrix({
    tableName: 'recurring_transactions',
    payloadFor: (userId) => ({
      user_id: userId,
      description: 'QA Netflix',
      period: 'monthly',
      average_amount_cents: 1500,
      currency: 'BAM',
      occurrences: 6,
    }),
    updateField: { column: 'active', value: false },
  });
});
