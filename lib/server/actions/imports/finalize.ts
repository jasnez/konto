'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  loadFinalizeContext,
  persistFinalizedBatch,
  prepareImportRows,
} from '@/lib/server/imports/finalize-pipeline';
import {
  BatchIdInputSchema,
  buildValidationDetails,
  markBatchFailed,
  revalidateImportViews,
  type ValidationDetails,
} from './shared';

export type FinalizeImportResult =
  | { success: true; data: { imported: number; skippedDuplicates: number } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'ALL_DUPLICATES' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export async function finalizeImport(input: unknown): Promise<FinalizeImportResult> {
  const zod = BatchIdInputSchema.safeParse(input);
  if (!zod.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(zod.error),
    };
  }

  const { batchId } = zod.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const loaded = await loadFinalizeContext(supabase, user.id, batchId);
  if (!loaded.ok) {
    return { success: false, error: loaded.error };
  }
  const { ctx } = loaded;

  const prep = await prepareImportRows(ctx, user.id);
  if (!prep.ok) {
    await markBatchFailed(supabase, batchId, user.id);
    return { success: false, error: prep.error };
  }

  // S-1: duplicate handling moved to review. Potential duplicates are flagged
  // at parse time and deselected by default; loadFinalizeContext only loads
  // rows with selected_for_import = true. So every row here is one the user
  // chose to import — finalize no longer silently drops anything.
  const persist = await persistFinalizedBatch(
    supabase,
    batchId,
    user.id,
    prep.prepared,
    0,
    ctx.batch.storage_path,
  );
  if (!persist.ok) {
    return { success: false, error: persist.error };
  }

  revalidateImportViews(ctx.batch.account_id);
  revalidatePath(`/import/${batchId}`);
  return {
    success: true,
    data: { imported: persist.imported, skippedDuplicates: 0 },
  };
}
