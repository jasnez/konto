/**
 * RLS for public.receipt_scans (F4-E1-T1).
 *
 * Required: user_id, mime, size_bytes, storage_path. Soft-deleted rows
 * also exist (deleted_at column may be present per schema), but the
 * matrix's INSERT/SELECT/UPDATE/DELETE chain still applies on live rows.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('receipt_scans RLS', () => {
  registerRlsMatrix({
    tableName: 'receipt_scans',
    payloadFor: (userId) => ({
      user_id: userId,
      mime: 'image/jpeg',
      size_bytes: 1024,
      storage_path: `qa-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}.jpg`,
      status: 'uploaded',
    }),
    updateField: { column: 'status', value: 'cancelled' },
  });
});
