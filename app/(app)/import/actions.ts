'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { persistPdfImportTransaction } from '@/lib/import/persist-import-transaction';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

type ParsedTxUpdate = Database['public']['Tables']['parsed_transactions']['Update'];

const BatchIdSchema = z.uuid();

interface ValidationDetails {
  _root: string[];
}

function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

function revalidateImportViews(accountId: string | null): void {
  revalidatePath('/import');
  revalidatePath('/transakcije');
  revalidatePath('/pocetna');
  if (accountId) {
    revalidatePath(`/racuni/${accountId}`);
  }
}

const UpdateParsedRowSchema = z
  .object({
    id: z.uuid(),
    batchId: z.uuid(),
    transaction_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    raw_description: z.string().min(1).max(500).optional(),
    amount_minor: z.number().int().optional(),
    category_id: z.union([z.uuid(), z.null()]).optional(),
    merchant_id: z.union([z.uuid(), z.null()]).optional(),
    selected_for_import: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.transaction_date !== undefined ||
      v.raw_description !== undefined ||
      v.amount_minor !== undefined ||
      v.category_id !== undefined ||
      v.merchant_id !== undefined ||
      v.selected_for_import !== undefined,
    { message: 'Nema izmjena za snimiti.' },
  );

export type UpdateParsedRowResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function updateParsedTransactionRow(input: unknown): Promise<UpdateParsedRowResult> {
  const parsed = UpdateParsedRowSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const p = parsed.data;
  const { data: row, error: loadErr } = await supabase
    .from('parsed_transactions')
    .select('id, batch_id, user_id, status')
    .eq('id', p.id)
    .eq('batch_id', p.batchId)
    .maybeSingle();

  if (loadErr) {
    console.error('update_parsed_row_load', { userId: user.id, error: loadErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (row?.user_id !== user.id) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (row.status !== 'pending_review') {
    return { success: false, error: 'NOT_FOUND' };
  }

  const patch: ParsedTxUpdate = {};
  if (p.transaction_date !== undefined) patch.transaction_date = p.transaction_date;
  if (p.raw_description !== undefined) patch.raw_description = p.raw_description;
  if (p.amount_minor !== undefined) patch.amount_minor = p.amount_minor;
  if (p.category_id !== undefined) patch.category_id = p.category_id;
  if (p.merchant_id !== undefined) patch.merchant_id = p.merchant_id;
  if (p.selected_for_import !== undefined) patch.selected_for_import = p.selected_for_import;

  const { error: upErr } = await supabase.from('parsed_transactions').update(patch).eq('id', p.id);
  if (upErr) {
    console.error('update_parsed_row', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${p.batchId}`);
  return { success: true };
}

const BulkCategorySchema = z.object({
  batchId: z.uuid(),
  parsedIds: z.array(z.uuid()).min(1),
  categoryId: z.union([z.uuid(), z.null()]),
});

export type BulkCategoryParsedResult =
  | { success: true; updated: number }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function bulkApplyCategoryToParsedRows(
  input: unknown,
): Promise<BulkCategoryParsedResult> {
  const parsed = BulkCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { batchId, parsedIds, categoryId } = parsed.data;

  if (categoryId) {
    const { data: cat, error: cErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) {
      console.error('bulk_parsed_category_check', { userId: user.id, error: cErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!cat) {
      return { success: false, error: 'NOT_FOUND' };
    }
  }

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (bErr) {
    console.error('bulk_parsed_batch', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { data: rows, error: rErr } = await supabase
    .from('parsed_transactions')
    .select('id')
    .eq('batch_id', batchId)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .in('id', parsedIds);

  if (rErr) {
    console.error('bulk_parsed_load', { userId: user.id, error: rErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const allowed = new Set(rows.map((r) => r.id));
  const targetIds = parsedIds.filter((id) => allowed.has(id));
  if (targetIds.length === 0) {
    return { success: true, updated: 0 };
  }

  const { error: uErr } = await supabase
    .from('parsed_transactions')
    .update({ category_id: categoryId })
    .in('id', targetIds);

  if (uErr) {
    console.error('bulk_parsed_update', { userId: user.id, error: uErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${batchId}`);
  return { success: true, updated: targetIds.length };
}

export type ConfirmImportResult =
  | { success: true; data: { imported: number; skippedDuplicates: number } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'ALL_DUPLICATES' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export async function confirmImportBatch(input: unknown): Promise<ConfirmImportResult> {
  const zod = z.object({ batchId: BatchIdSchema }).safeParse(input);
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
    console.error('confirm_import_batch_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'BAD_STATE' };
  }
  if (batch.status !== 'ready' || !batch.account_id) {
    return { success: false, error: 'BAD_STATE' };
  }

  const accountId = batch.account_id;

  const { data: staged, error: sErr } = await supabase
    .from('parsed_transactions')
    .select(
      'id, transaction_date, amount_minor, currency, raw_description, merchant_id, category_id, selected_for_import, status',
    )
    .eq('batch_id', batchId)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .order('transaction_date', { ascending: true });

  if (sErr) {
    console.error('confirm_import_staged', { userId: user.id, error: sErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const toImport = staged.filter((r) => r.selected_for_import);
  let imported = 0;
  let skippedDuplicates = 0;

  for (const row of toImport) {
    if (row.amount_minor === 0) {
      continue;
    }
    const result = await persistPdfImportTransaction(supabase, {
      userId: user.id,
      accountId,
      batchId,
      transactionDate: row.transaction_date,
      amountMinor: BigInt(row.amount_minor),
      currency: row.currency,
      merchantRaw: row.raw_description,
      merchantId: row.merchant_id,
      categoryId: row.category_id,
    });

    if (result.ok) {
      const { error: linkErr } = await supabase
        .from('parsed_transactions')
        .update({
          status: 'imported',
          transaction_id: result.transactionId,
        })
        .eq('id', row.id);
      if (linkErr) {
        console.error('confirm_import_link_parsed', { userId: user.id, error: linkErr.message });
        return { success: false, error: 'DATABASE_ERROR' };
      }
      imported += 1;
    } else if (result.error === 'DUPLICATE') {
      skippedDuplicates += 1;
    } else if (result.error === 'EXTERNAL_SERVICE_ERROR') {
      return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
    } else {
      console.error('confirm_import_persist', { userId: user.id, error: result.error });
      return { success: false, error: 'DATABASE_ERROR' };
    }
  }

  const attemptedNonZero = toImport.filter((r) => r.amount_minor !== 0);
  if (attemptedNonZero.length > 0 && imported === 0) {
    return { success: false, error: 'ALL_DUPLICATES' };
  }

  const { error: finErr } = await supabase
    .from('import_batches')
    .update({ status: 'imported' })
    .eq('id', batchId)
    .eq('user_id', user.id);

  if (finErr) {
    console.error('confirm_import_finalize', { userId: user.id, error: finErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateImportViews(accountId);
  revalidatePath(`/import/${batchId}`);
  return { success: true, data: { imported, skippedDuplicates } };
}

export type CancelImportResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function cancelImportBatch(input: unknown): Promise<CancelImportResult> {
  const zod = z.object({ batchId: BatchIdSchema }).safeParse(input);
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
    .select('id, storage_path, status')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (bErr) {
    console.error('cancel_import_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (batch.status === 'imported') {
    return { success: false, error: 'NOT_FOUND' };
  }

  if (batch.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from('bank-statements')
      .remove([batch.storage_path]);
    if (rmErr) {
      console.error('cancel_import_storage', { userId: user.id, error: rmErr.message });
      // Continue — still delete batch so user is not stuck.
    }
  }

  const { error: dErr } = await supabase
    .from('import_batches')
    .delete()
    .eq('id', batchId)
    .eq('user_id', user.id);
  if (dErr) {
    console.error('cancel_import_delete', { userId: user.id, error: dErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/import');
  return { success: true };
}
