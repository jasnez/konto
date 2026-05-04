/**
 * RLS for public.insights (F4-E1-T1).
 *
 * Insights are written by the nightly cron via service-role and by the
 * `regenerateInsights` Server Action (also service-role). There is NO
 * authenticated INSERT policy — users can only SELECT and UPDATE their
 * own rows (the UPDATE is constrained by the Server Action to flipping
 * `dismissed_at`, but the RLS policy itself permits any column).
 *
 * We assert:
 *   - User A cannot INSERT (selfInsertMustFail).
 *   - User A cannot SELECT B's row.
 *   - User A cannot UPDATE B's row.
 *   - User A cannot DELETE B's row (delete returns 0 rows; insights has no
 *     DELETE policy at all, so even self-delete would 0-row).
 *   - User A cannot INSERT with user_id = B (same as own — no INSERT policy).
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('insights RLS', () => {
  registerRlsMatrix({
    tableName: 'insights',
    selfInsertMustFail: true,
    payloadFor: (userId) => ({
      user_id: userId,
      type: 'category_anomaly',
      severity: 'info',
      title: 'QA RLS insight',
      body: 'QA',
      dedup_key: `qa-rls-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
    }),
    updateField: { column: 'dismissed_at', value: new Date().toISOString() },
  });
});
