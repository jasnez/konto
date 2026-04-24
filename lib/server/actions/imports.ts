'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeDedupHash } from '@/lib/dedup';
import { convertToBase } from '@/lib/fx/convert';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;
const STORAGE_BUCKET = 'bank-statements';

interface ValidationDetails {
  _root: string[];
}

type ParsedTxUpdate = Database['public']['Tables']['parsed_transactions']['Update'];

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

function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is outside safe integer range for DB client transport.');
  }
  return Number(value);
}

// ------------------------------------------------------------------
// uploadStatement
// ------------------------------------------------------------------

const UploadSchema = z.object({
  accountId: z.uuid(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'Fajl je obavezan')
    .refine((f) => f.size <= MAX_PDF_SIZE_BYTES, 'Fajl je veći od 10 MB')
    .refine((f) => f.type === 'application/pdf', 'Samo PDF je dozvoljen'),
});

export type UploadStatementResult =
  | { success: true; data: { batchId: string } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DUPLICATE'; batchId: string }
  | { success: false; error: 'STORAGE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function uploadStatement(formData: FormData): Promise<UploadStatementResult> {
  const parsed = UploadSchema.safeParse({
    accountId: formData.get('accountId'),
    file: formData.get('file'),
  });
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
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { accountId, file } = parsed.data;

  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('id, user_id, institution')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (accountErr) {
    console.error('upload_statement_account_error', { userId: user.id, error: accountErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!account) return { success: false, error: 'NOT_FOUND' };

  const arrayBuffer = await file.arrayBuffer();
  const checksum = createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex');

  const { data: existing, error: existingErr } = await supabase
    .from('import_batches')
    .select('id')
    .eq('user_id', user.id)
    .eq('checksum', checksum)
    .maybeSingle();
  if (existingErr) {
    console.error('upload_statement_duplicate_check_error', {
      userId: user.id,
      error: existingErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (existing?.id) {
    return { success: false, error: 'DUPLICATE', batchId: existing.id };
  }

  const path = `${user.id}/${randomUUID()}.pdf`;
  const { error: uploadErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadErr) {
    console.error('upload_statement_storage_error', { userId: user.id, error: uploadErr.message });
    return { success: false, error: 'STORAGE_ERROR' };
  }

  const { data: batch, error: insertErr } = await supabase
    .from('import_batches')
    .insert({
      user_id: user.id,
      account_id: accountId,
      storage_path: path,
      checksum,
      status: 'uploaded',
      original_filename: file.name,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('upload_statement_insert_error', {
      userId: user.id,
      error: insertErr.message,
    });
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path])
      .catch(() => {
        // Best-effort cleanup.
      });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const batchId = batch.id;
  if (!batchId) {
    console.error('upload_statement_insert_error', { userId: user.id, error: 'missing id' });
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path])
      .catch(() => {
        // Best-effort cleanup.
      });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/import');
  return { success: true, data: { batchId } };
}

// ------------------------------------------------------------------
// updateParsedTransaction(id, patch)
// ------------------------------------------------------------------

const UpdateParsedTransactionSchema = z
  .object({
    id: z.uuid(),
    batchId: z.uuid(),
    transaction_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Datum mora biti u formatu YYYY-MM-DD.')
      .optional(),
    raw_description: z.string().min(1).max(500).optional(),
    amount_minor: z
      .number()
      .int('Iznos mora biti cijeli broj (centi).')
      .refine(
        (n) => n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER,
        'Iznos je izvan sigurnog raspona.',
      )
      .optional(),
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

export type UpdateParsedTransactionResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function updateParsedTransaction(
  input: unknown,
): Promise<UpdateParsedTransactionResult> {
  const parsed = UpdateParsedTransactionSchema.safeParse(input);
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

  // Explicit ownership check (defence in depth on top of RLS).
  const { data: row, error: loadErr } = await supabase
    .from('parsed_transactions')
    .select('id, batch_id, user_id, status')
    .eq('id', p.id)
    .eq('batch_id', p.batchId)
    .maybeSingle();

  if (loadErr) {
    console.error('update_parsed_transaction_load', { userId: user.id, error: loadErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (row?.user_id !== user.id || row.status !== 'pending_review') {
    return { success: false, error: 'NOT_FOUND' };
  }

  if (p.category_id) {
    const { data: cat, error: cErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', p.category_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) {
      console.error('update_parsed_transaction_cat', { userId: user.id, error: cErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!cat) {
      return { success: false, error: 'NOT_FOUND' };
    }
  }

  if (p.merchant_id) {
    const { data: m, error: mErr } = await supabase
      .from('merchants')
      .select('id')
      .eq('id', p.merchant_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (mErr) {
      console.error('update_parsed_transaction_merchant', {
        userId: user.id,
        error: mErr.message,
      });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!m) {
      return { success: false, error: 'NOT_FOUND' };
    }
  }

  const patch: ParsedTxUpdate = {};
  if (p.transaction_date !== undefined) patch.transaction_date = p.transaction_date;
  if (p.raw_description !== undefined) patch.raw_description = p.raw_description;
  if (p.amount_minor !== undefined) patch.amount_minor = p.amount_minor;
  if (p.category_id !== undefined) patch.category_id = p.category_id;
  if (p.merchant_id !== undefined) patch.merchant_id = p.merchant_id;
  if (p.selected_for_import !== undefined) patch.selected_for_import = p.selected_for_import;
  if (p.category_id !== undefined || p.merchant_id !== undefined) {
    if (p.category_id === null && (p.merchant_id === undefined || p.merchant_id === null)) {
      patch.categorization_source = 'none';
      patch.categorization_confidence = 0;
    } else {
      patch.categorization_source = 'user';
      patch.categorization_confidence = 1;
    }
  }

  const { error: upErr } = await supabase
    .from('parsed_transactions')
    .update(patch)
    .eq('id', p.id)
    .eq('user_id', user.id);
  if (upErr) {
    console.error('update_parsed_transaction', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${p.batchId}`);
  return { success: true };
}

// ------------------------------------------------------------------
// togglePartialExclusion(ids[], excluded)
// ------------------------------------------------------------------

const TogglePartialExclusionSchema = z.object({
  batchId: z.uuid(),
  parsedIds: z.array(z.uuid()).min(1, 'Odaberi barem jednu stavku.'),
  excluded: z.boolean(),
});

export type TogglePartialExclusionResult =
  | { success: true; updated: number }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function togglePartialExclusion(
  input: unknown,
): Promise<TogglePartialExclusionResult> {
  const parsed = TogglePartialExclusionSchema.safeParse(input);
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

  const { batchId, parsedIds, excluded } = parsed.data;

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (bErr) {
    console.error('toggle_partial_exclusion_batch', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { data: updated, error: upErr } = await supabase
    .from('parsed_transactions')
    .update({ selected_for_import: !excluded })
    .eq('batch_id', batchId)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .in('id', parsedIds)
    .select('id');

  if (upErr) {
    console.error('toggle_partial_exclusion', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${batchId}`);
  return { success: true, updated: updated.length };
}

// ------------------------------------------------------------------
// bulkApplyCategoryToParsedRows
// ------------------------------------------------------------------

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
    .update({
      category_id: categoryId,
      categorization_source: categoryId ? 'user' : 'none',
      categorization_confidence: categoryId ? 1 : 0,
    })
    .eq('user_id', user.id)
    .in('id', targetIds);

  if (uErr) {
    console.error('bulk_parsed_update', { userId: user.id, error: uErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${batchId}`);
  return { success: true, updated: targetIds.length };
}

// ------------------------------------------------------------------
// finalizeImport(batchId)
// ------------------------------------------------------------------

const BatchIdInputSchema = z.object({ batchId: z.uuid() });

export type FinalizeImportResult =
  | { success: true; data: { imported: number; skippedDuplicates: number } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'BAD_STATE' }
  | { success: false; error: 'ALL_DUPLICATES' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

interface PreparedImportRow {
  account_id: string;
  original_amount_cents: number;
  original_currency: string;
  base_amount_cents: number;
  base_currency: string;
  fx_rate: number;
  fx_rate_date: string;
  fx_stale: boolean;
  transaction_date: string;
  merchant_raw: string;
  merchant_id: string | null;
  category_id: string | null;
  category_source: string | null;
  category_confidence: number | null;
  dedup_hash: string;
}

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

  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id, status, account_id, storage_path')
    .eq('id', batchId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (bErr) {
    console.error('finalize_import_load', { userId: user.id, error: bErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (batch.status !== 'ready' || !batch.account_id) {
    return { success: false, error: 'BAD_STATE' };
  }

  const accountId = batch.account_id;

  // 1. Load selected staging rows.
  const { data: staged, error: sErr } = await supabase
    .from('parsed_transactions')
    .select(
      'id, transaction_date, amount_minor, currency, raw_description, merchant_id, category_id, categorization_source, categorization_confidence',
    )
    .eq('batch_id', batchId)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .eq('selected_for_import', true)
    .order('transaction_date', { ascending: true });

  if (sErr) {
    console.error('finalize_import_staged', { userId: user.id, error: sErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const staging = staged.filter((r) => r.amount_minor !== 0);
  if (staging.length === 0) {
    return { success: false, error: 'BAD_STATE' };
  }

  // 2. Base currency from profile (fallback BAM).
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  if (pErr) {
    console.error('finalize_import_profile', { userId: user.id, error: pErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  const baseCurrency = profile?.base_currency ?? 'BAM';

  // 3. Compute FX + dedup hash per row in Node (network calls allowed here).
  const prepared: (PreparedImportRow & { sourceId: string })[] = [];
  for (const row of staging) {
    let fx: Awaited<ReturnType<typeof convertToBase>>;
    try {
      fx = await convertToBase(
        BigInt(row.amount_minor),
        row.currency,
        baseCurrency,
        row.transaction_date,
      );
    } catch (error) {
      console.error('finalize_import_fx', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
    }

    const dedupHash = computeDedupHash({
      account_id: accountId,
      amount_cents: BigInt(row.amount_minor),
      date: row.transaction_date,
      merchant: row.raw_description,
    });

    prepared.push({
      sourceId: row.id,
      account_id: accountId,
      original_amount_cents: row.amount_minor,
      original_currency: row.currency,
      base_amount_cents: bigintToDbInt(fx.baseCents),
      base_currency: baseCurrency,
      fx_rate: fx.fxRate,
      fx_rate_date: fx.fxRateDate,
      fx_stale: fx.fxStale,
      transaction_date: row.transaction_date,
      merchant_raw: row.raw_description,
      merchant_id: row.merchant_id,
      category_id: row.category_id,
      category_source: row.category_id ? (row.categorization_source ?? 'user') : null,
      category_confidence: row.category_id ? (row.categorization_confidence ?? 1) : null,
      dedup_hash: dedupHash,
    });
  }

  // 4. Detect duplicates against existing transactions in one query.
  const dedupHashes = prepared.map((r) => r.dedup_hash);
  const { data: dupRows, error: dupErr } = await supabase
    .from('transactions')
    .select('dedup_hash, transaction_date')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('dedup_hash', dedupHashes);

  if (dupErr) {
    console.error('finalize_import_dup', { userId: user.id, error: dupErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const duplicateHashes = new Set(
    dupRows.map((r) => r.dedup_hash).filter((h): h is string => typeof h === 'string'),
  );
  const toInsert = prepared.filter((r) => !duplicateHashes.has(r.dedup_hash));
  const skippedDuplicates = prepared.length - toInsert.length;

  if (toInsert.length === 0) {
    return { success: false, error: 'ALL_DUPLICATES' };
  }

  // 5. Atomic RPC: insert transactions, delete staging, mark batch.
  const rpcPayload = toInsert.map((r) => ({
    account_id: r.account_id,
    original_amount_cents: r.original_amount_cents,
    original_currency: r.original_currency,
    base_amount_cents: r.base_amount_cents,
    base_currency: r.base_currency,
    fx_rate: r.fx_rate,
    fx_rate_date: r.fx_rate_date,
    fx_stale: r.fx_stale,
    transaction_date: r.transaction_date,
    merchant_raw: r.merchant_raw,
    merchant_id: r.merchant_id,
    category_id: r.category_id,
    category_source: r.category_source,
    category_confidence: r.category_confidence,
    dedup_hash: r.dedup_hash,
  }));

  const { data: rpcData, error: rpcErr } = await supabase.rpc('finalize_import_batch', {
    p_batch_id: batchId,
    p_rows: rpcPayload,
  });

  if (rpcErr) {
    const msg = rpcErr.message;
    if (msg.includes('UNAUTHORIZED')) return { success: false, error: 'UNAUTHORIZED' };
    if (msg.includes('NOT_FOUND')) return { success: false, error: 'NOT_FOUND' };
    if (msg.includes('BAD_STATE')) return { success: false, error: 'BAD_STATE' };
    console.error('finalize_import_rpc', { userId: user.id, error: msg });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const imported = extractImportedCount(rpcData);

  // 6. Best-effort PDF cleanup (24h rule, but we remove immediately once imported).
  if (batch.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([batch.storage_path]);
    if (rmErr) {
      console.warn('finalize_import_storage_cleanup', {
        userId: user.id,
        error: rmErr.message,
      });
      // Non-fatal: the DB transaction already committed.
    }
  }

  revalidateImportViews(accountId);
  revalidatePath(`/import/${batchId}`);
  return { success: true, data: { imported, skippedDuplicates } };
}

function extractImportedCount(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'imported' in raw) {
    const value = raw.imported;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

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
    console.error('reject_import_load', { userId: user.id, error: bErr.message });
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
    console.error('reject_import_staging_delete', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  if (batch.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([batch.storage_path]);
    if (rmErr) {
      console.warn('reject_import_storage_cleanup', { userId: user.id, error: rmErr.message });
      // Non-fatal: proceed so batch still gets marked rejected.
    }
  }

  const { error: updErr } = await supabase
    .from('import_batches')
    .update({ status: 'rejected', storage_path: null })
    .eq('id', batchId)
    .eq('user_id', user.id);

  if (updErr) {
    console.error('reject_import_mark', { userId: user.id, error: updErr.message });
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
    console.error('retry_import_parse_load', { userId: user.id, error: bErr.message });
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
    console.error('retry_import_parse_staging', { userId: user.id, error: delErr.message });
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
    console.error('retry_import_parse_reset', { userId: user.id, error: updErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateImportViews(batch.account_id ?? null);
  revalidatePath(`/import/${batchId}`);
  return { success: true };
}
