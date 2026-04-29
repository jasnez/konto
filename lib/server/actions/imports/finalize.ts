'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  filterDuplicates,
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

  const dedup = await filterDuplicates(supabase, ctx.batch.account_id, prep.prepared, user.id);
  if (!dedup.ok) {
    return { success: false, error: dedup.error };
  }
  if (dedup.toInsert.length === 0) {
    return { success: false, error: 'ALL_DUPLICATES' };
  }

  const persist = await persistFinalizedBatch(
    supabase,
    batchId,
    user.id,
    dedup.toInsert,
    dedup.skipped,
    ctx.batch.storage_path,
  );
  if (!persist.ok) {
    return { success: false, error: persist.error };
  }

  revalidateImportViews(ctx.batch.account_id);
  revalidatePath(`/import/${batchId}`);
  return {
    success: true,
    data: { imported: persist.imported, skippedDuplicates: dedup.skipped },
  };
}
