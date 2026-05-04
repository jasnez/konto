/**
 * RLS for public.categorization_rules (F4-E1-T1).
 *
 * All FK refs are optional; we omit them to keep the payload minimal.
 * WITH CHECK on cross-user INSERT trips on user_id mismatch.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('categorization_rules RLS', () => {
  registerRlsMatrix({
    tableName: 'categorization_rules',
    payloadFor: (userId) => ({
      user_id: userId,
      name: 'QA RLS rule',
      match_description_pattern: 'BINGO',
      priority: 1,
      is_active: true,
    }),
    updateField: { column: 'is_active', value: false },
  });
});
