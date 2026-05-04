/**
 * RLS for public.parsed_transactions (F4-E1-T1).
 *
 * Requires a parent `import_batches` row. The matrix's payloadFor seeds
 * one via the admin client.
 */
import { describe } from 'vitest';
import { SHOULD_RUN } from './helpers';
import { registerRlsMatrix } from './run-rls-matrix';

describe.skipIf(!SHOULD_RUN)('parsed_transactions RLS', () => {
  registerRlsMatrix({
    tableName: 'parsed_transactions',
    payloadFor: async (userId, admin) => {
      const batch = await admin
        .from('import_batches')
        .insert({
          user_id: userId,
          checksum: `qa-pt-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}`,
          original_filename: 'qa-rls.pdf',
          status: 'uploaded',
        })
        .select('id')
        .single();
      if (batch.error) throw batch.error;
      return {
        user_id: userId,
        batch_id: batch.data.id,
        amount_minor: -1500,
        currency: 'BAM',
        raw_description: 'QA RLS line',
        transaction_date: '2026-05-04',
      };
    },
    updateField: { column: 'selected_for_import', value: false },
  });
});
