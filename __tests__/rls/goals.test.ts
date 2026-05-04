/**
 * RLS for public.goals (F4-E1-T1).
 *
 * No required FKs — `account_id` is optional. Trigger
 * `check_goal_achieved` runs on UPDATE only and ignores INSERT, so a fresh
 * row with target above current is fine.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('goals RLS', () => {
  registerRlsMatrix({
    tableName: 'goals',
    payloadFor: (userId) => ({
      user_id: userId,
      name: 'QA RLS goal',
      target_amount_cents: 100_000,
      currency: 'BAM',
    }),
    updateField: { column: 'name', value: 'hijacked' },
  });
});
