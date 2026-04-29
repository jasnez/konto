'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { CategorizationSource } from '@/lib/categorization/cascade';
import { maybeCreateAlias, recordCorrection } from '@/lib/categorization/learn';
import { createClient } from '@/lib/supabase/server';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';
import {
  LEARNABLE_SOURCES,
  buildValidationDetails,
  isCategorizationSource,
  type ValidationDetails,
} from './shared';

type ParsedTxUpdate = Database['public']['Tables']['parsed_transactions']['Update'];

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
  | { success: true; data?: { aliasCreated?: boolean } }
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

  // Explicit ownership check (defence in depth on top of RLS). We also pull
  // the fields the learning loop (F2-E4-T3) needs so we can decide whether
  // to record a correction without a second round-trip.
  const { data: row, error: loadErr } = await supabase
    .from('parsed_transactions')
    .select(
      'id, batch_id, user_id, status, raw_description, category_id, categorization_source, categorization_confidence',
    )
    .eq('id', p.id)
    .eq('batch_id', p.batchId)
    .maybeSingle();

  if (loadErr) {
    logSafe('update_parsed_transaction_load', { userId: user.id, error: loadErr.message });
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
      logSafe('update_parsed_transaction_cat', { userId: user.id, error: cErr.message });
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
      logSafe('update_parsed_transaction_merchant', {
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
    logSafe('update_parsed_transaction', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // Learning loop (F2-E4-T3): when the user genuinely overrides a
  // non-deterministic suggestion, ledger the correction and check whether
  // we have enough evidence to materialise an alias. We deliberately:
  //   - skip 'rule' / 'alias_exact' (the user is overriding a rule of their
  //     own — there's nothing to learn beyond editing the rule),
  //   - skip when the category didn't actually change (no signal),
  //   - run after the parsed_transactions write so a learning failure can
  //     never roll back the user-visible change.
  let aliasCreated = false;
  const sourceBefore: CategorizationSource | null = isCategorizationSource(
    row.categorization_source,
  )
    ? row.categorization_source
    : null;
  if (
    p.category_id !== undefined &&
    p.category_id !== null &&
    p.category_id !== row.category_id &&
    (sourceBefore === null || LEARNABLE_SOURCES.has(sourceBefore)) &&
    typeof row.raw_description === 'string' &&
    row.raw_description.trim().length > 0
  ) {
    const { normalizedDescription, ok } = await recordCorrection(supabase, {
      userId: user.id,
      originalDescription: row.raw_description,
      newCategoryId: p.category_id,
      oldCategoryId: row.category_id ?? null,
      sourceBefore,
      confidenceBefore:
        typeof row.categorization_confidence === 'number' ? row.categorization_confidence : null,
    });
    if (ok && normalizedDescription.length > 0) {
      const aliasResult = await maybeCreateAlias(supabase, {
        userId: user.id,
        description: row.raw_description,
        categoryId: p.category_id,
      });
      aliasCreated = aliasResult.created;
    }
  }

  revalidatePath(`/import/${p.batchId}`);
  return aliasCreated ? { success: true, data: { aliasCreated: true } } : { success: true };
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
    logSafe('toggle_partial_exclusion_batch', { userId: user.id, error: bErr.message });
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
    logSafe('toggle_partial_exclusion', { userId: user.id, error: upErr.message });
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
      logSafe('bulk_parsed_category_check', { userId: user.id, error: cErr.message });
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
    logSafe('bulk_parsed_batch', { userId: user.id, error: bErr.message });
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
    logSafe('bulk_parsed_load', { userId: user.id, error: rErr.message });
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
    logSafe('bulk_parsed_update', { userId: user.id, error: uErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath(`/import/${batchId}`);
  return { success: true, updated: targetIds.length };
}
