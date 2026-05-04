/**
 * RLS for public.user_corrections (F4-E1-T1).
 *
 * Append-only correction log fed by the categorization "learn" action.
 * `field` is required; everything else is optional metadata.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('user_corrections RLS', () => {
  registerRlsMatrix({
    tableName: 'user_corrections',
    payloadFor: (userId) => ({
      user_id: userId,
      // CHECK constraint allows: category, merchant, amount, date, description, tags, is_transfer
      field: 'category',
      old_value: null,
      new_value: 'qa-cat-id',
      description_normalized: 'qa rls correction',
    }),
    // user_corrections table is append-only by convention but we still
    // verify cross-user UPDATE returns 0 rows (RLS USING filters).
    updateField: { column: 'new_value', value: 'hijacked' },
  });
});
