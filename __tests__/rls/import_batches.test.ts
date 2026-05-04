/**
 * RLS for public.import_batches (F4-E1-T1).
 *
 * Required: user_id, checksum, original_filename. The optional
 * `account_id` would also have to belong to the user (FK ownership), but
 * we skip it to keep the matrix's payload portable.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('import_batches RLS', () => {
  registerRlsMatrix({
    tableName: 'import_batches',
    payloadFor: (userId) => ({
      user_id: userId,
      checksum: `qa-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
      original_filename: 'qa-rls.pdf',
      status: 'uploaded',
    }),
    updateField: { column: 'status', value: 'rejected' },
  });
});
