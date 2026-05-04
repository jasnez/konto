/**
 * RLS for public.llm_categorization_cache (F4-E1-T1).
 *
 * Standard user_id-scoped cache for LLM classification responses. No
 * required FKs — `category_id` is nullable (a miss can cache as null).
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('llm_categorization_cache RLS', () => {
  registerRlsMatrix({
    tableName: 'llm_categorization_cache',
    payloadFor: (userId) => ({
      user_id: userId,
      description_normalized: `qa-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
      amount_bucket: 5000,
      currency: 'BAM',
      category_id: null,
      confidence: 0,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }),
    updateField: { column: 'confidence', value: 0.99 },
  });
});
