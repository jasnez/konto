'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logSafe, logWarn } from '@/lib/logger';
import {
  BatchIdInputSchema,
  STORAGE_BUCKET,
  buildValidationDetails,
  revalidateImportViews,
  type ValidationDetails,
} from './shared';

// ------------------------------------------------------------------
// rejectImport(batchId)
// ------------------------------------------------------------------

export type RejectImportResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function rejectImport(input: unknown): Promise<RejectImportResult> {
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

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id, status, storage_path, account_id')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (bErr) {
    logSafe('reject_import_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (batch.status === 'imported') {
    return { success: false, error: 'BAD_STATE' };
  }

  const { error: delErr } = await supabase
    .from('parsed_transactions')
    .delete()
    .eq('batch_id', batchId)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('reject_import_staging_delete', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  if (batch.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([batch.storage_path]);
    if (rmErr) {
      logWarn('reject_import_storage_cleanup', { userId: user.id, error: rmErr.message });
      // Non-fatal: proceed so batch still gets marked rejected.
    }
  }

  const { error: updErr } = await supabase
    .from('import_batches')
    .update({ status: 'rejected', storage_path: null })
    .eq('id', batchId)
    .eq('user_id', user.id);

  if (updErr) {
    logSafe('reject_import_mark', { userId: user.id, error: updErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateImportViews(batch.account_id ?? null);
  revalidatePath(`/import/${batchId}`);
  return { success: true };
}

// ------------------------------------------------------------------
// retryImportParse(batchId) — reset failed or empty-ready batch to re-run POST /parse
// ------------------------------------------------------------------

export type RetryImportParseResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function retryImportParse(input: unknown): Promise<RetryImportParseResult> {
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

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id, status, account_id')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (bErr) {
    logSafe('retry_import_parse_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (batch.status !== 'failed' && batch.status !== 'ready') {
    return { success: false, error: 'BAD_STATE' };
  }

  const { error: delErr } = await supabase
    .from('parsed_transactions')
    .delete()
    .eq('batch_id', batchId)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('retry_import_parse_staging', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const { error: updErr } = await supabase
    .from('import_batches')
    .update({
      status: 'uploaded',
      error_message: null,
      transaction_count: null,
      parse_confidence: null,
      parse_warnings: null,
      statement_period_start: null,
      statement_period_end: null,
      imported_at: null,
    })
    .eq('id', batchId)
    .eq('user_id', user.id);

  if (updErr) {
    logSafe('retry_import_parse_reset', { userId: user.id, error: updErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateImportViews(batch.account_id ?? null);
  revalidatePath(`/import/${batchId}`);
  return { success: true };
}

// ------------------------------------------------------------------
// retryImportFinalize(batchId) — retry FX-failed finalize without resetting parsed_transactions
// ------------------------------------------------------------------

export type RetryImportFinalizeResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function retryImportFinalize(input: unknown): Promise<RetryImportFinalizeResult> {
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

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id, status, account_id, error_message')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (bErr) {
    logSafe('retry_import_finalize_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (batch.status !== 'failed' || batch.error_message !== 'fx_unavailable') {
    return { success: false, error: 'BAD_STATE' };
  }

  const { error: updErr } = await supabase
    .from('import_batches')
    .update({
      status: 'ready',
      error_message: null,
    })
    .eq('id', batchId)
    .eq('user_id', user.id);

  if (updErr) {
    logSafe('retry_import_finalize_reset', { userId: user.id, error: updErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateImportViews(batch.account_id ?? null);
  revalidatePath(`/import/${batchId}`);
  return { success: true };
}
