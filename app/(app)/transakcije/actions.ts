'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeDedupHash } from '@/lib/dedup';
import { convertToBase } from '@/lib/fx/convert';
import {
  BulkDeleteTransactionIdsSchema,
  CreateTransactionSchema,
  TransactionIdSchema,
  UpdateTransactionSchema,
  type CreateTransactionInputSchema,
} from '@/lib/schemas/transaction';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

interface CreateTransactionInput {
  account_id: string;
  amount_cents: bigint;
  currency: string;
  transaction_date: string;
  merchant_raw: string | null;
  merchant_id: string | null;
  category_id: string | null;
  notes: string | null;
}

interface UpdateTransactionInput {
  account_id?: string;
  amount_cents?: bigint;
  currency?: string;
  transaction_date?: string;
  merchant_raw?: string | null;
  category_id?: string | null;
  notes?: string | null;
}

interface ExistingTransactionRow {
  id: string;
  account_id: string;
  original_amount_cents: number;
  original_currency: string;
  transaction_date: string;
  merchant_raw: string | null;
  category_id: string | null;
  notes: string | null;
  deleted_at: string | null;
}

interface ValidationDetails {
  _root: string[];
}

export type CreateTransactionResult =
  | { success: true; data: { id: string } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'DUPLICATE'; duplicateId: string }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export type UpdateTransactionResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DUPLICATE'; duplicateId: string }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' };

export type DeleteTransactionResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'DATABASE_ERROR' };

export type RestoreTransactionResult = DeleteTransactionResult;

export type BulkDeleteTransactionsResult =
  | { success: true; data: { count: number } }
  | { success: false; error: 'VALIDATION_ERROR'; details: ValidationDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'DATABASE_ERROR' };

function buildValidationDetails(error: z.ZodError): ValidationDetails {
  return { _root: error.issues.map((issue) => issue.message) };
}

function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is outside safe integer range for DB client transport.');
  }
  return Number(value);
}

function dbIntToBigint(value: number): bigint {
  return BigInt(value);
}

function shiftIsoDateByDays(date: string, deltaDays: number): string {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) {
    return date;
  }
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function buildDuplicateWindowStart(transactionDate: string): string {
  return shiftIsoDateByDays(transactionDate, -30);
}

async function ensureOwnedAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
): Promise<{ ok: true; currency: string } | { ok: false; error: 'FORBIDDEN' | 'DATABASE_ERROR' }> {
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id,currency')
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (!account) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  return { ok: true, currency: account.currency };
}

async function ensureOwnedCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string | null,
): Promise<{ ok: true } | { ok: false; error: 'FORBIDDEN' | 'DATABASE_ERROR' }> {
  if (!categoryId) {
    return { ok: true };
  }

  const { data: category, error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (!category) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  return { ok: true };
}

async function ensureOwnedMerchant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  merchantId: string | null,
): Promise<{ ok: true } | { ok: false; error: 'FORBIDDEN' | 'DATABASE_ERROR' }> {
  if (!merchantId) {
    return { ok: true };
  }

  const { data: merchant, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('id', merchantId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (!merchant) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  return { ok: true };
}

async function getBaseCurrency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ ok: true; value: string } | { ok: false }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false };
  }

  return { ok: true, value: profile?.base_currency ?? 'BAM' };
}

async function findDuplicateTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    userId: string;
    dedupHash: string;
    transactionDate: string;
    excludeId?: string;
  },
): Promise<{ id: string } | null> {
  const windowStart = buildDuplicateWindowStart(input.transactionDate);

  let query = supabase
    .from('transactions')
    .select('id')
    .eq('user_id', input.userId)
    .eq('dedup_hash', input.dedupHash)
    .is('deleted_at', null)
    .gte('transaction_date', windowStart)
    .lte('transaction_date', input.transactionDate)
    .order('transaction_date', { ascending: false })
    .limit(1);

  if (input.excludeId) {
    query = query.neq('id', input.excludeId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return null;
  }

  return { id: data.id };
}

function revalidateTransactionViews(accountIds: string[]): void {
  revalidatePath('/transakcije');
  revalidatePath('/pocetna');
  for (const accountId of new Set(accountIds)) {
    revalidatePath(`/racuni/${accountId}`);
  }
}

export async function createTransaction(input: unknown): Promise<CreateTransactionResult> {
  const parsed = CreateTransactionSchema.safeParse(input);
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

  const parsedData: CreateTransactionInputSchema = parsed.data;
  const ownedAccount = await ensureOwnedAccount(supabase, user.id, parsedData.account_id);
  if (!ownedAccount.ok) {
    return { success: false, error: ownedAccount.error };
  }

  const ownedCategory = await ensureOwnedCategory(supabase, user.id, parsedData.category_id);
  if (!ownedCategory.ok) {
    return { success: false, error: ownedCategory.error };
  }

  const ownedMerchant = await ensureOwnedMerchant(
    supabase,
    user.id,
    parsedData.merchant_id ?? null,
  );
  if (!ownedMerchant.ok) {
    return { success: false, error: ownedMerchant.error };
  }

  const baseCurrencyResult = await getBaseCurrency(supabase, user.id);
  if (!baseCurrencyResult.ok) {
    return { success: false, error: 'DATABASE_ERROR' };
  }

  let fxResult: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxResult = await convertToBase(
      parsedData.amount_cents,
      parsedData.currency,
      baseCurrencyResult.value,
      parsedData.transaction_date,
    );
  } catch (error) {
    console.error('create_transaction_fx_error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const dedupHash = computeDedupHash({
    account_id: parsedData.account_id,
    amount_cents: parsedData.amount_cents,
    date: parsedData.transaction_date,
    merchant: parsedData.merchant_raw,
  });

  const duplicate = await findDuplicateTransaction(supabase, {
    userId: user.id,
    dedupHash,
    transactionDate: parsedData.transaction_date,
  });
  if (duplicate) {
    return { success: false, error: 'DUPLICATE', duplicateId: duplicate.id };
  }

  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: parsedData.account_id,
      original_amount_cents: bigintToDbInt(parsedData.amount_cents),
      original_currency: parsedData.currency,
      base_amount_cents: bigintToDbInt(fxResult.baseCents),
      base_currency: baseCurrencyResult.value,
      fx_rate: fxResult.fxRate,
      fx_rate_date: fxResult.fxRateDate,
      fx_stale: fxResult.fxStale,
      transaction_date: parsedData.transaction_date,
      merchant_raw: parsedData.merchant_raw,
      merchant_id: parsedData.merchant_id ?? null,
      category_id: parsedData.category_id,
      category_source: parsedData.category_id ? 'user' : null,
      notes: parsedData.notes,
      source: 'manual',
      dedup_hash: dedupHash,
    })
    .select('id')
    .single();

  if (error) {
    console.error('create_transaction_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateTransactionViews([parsedData.account_id]);
  return { success: true, data: { id: tx.id } };
}

export async function updateTransaction(
  id: unknown,
  input: unknown,
): Promise<UpdateTransactionResult> {
  const idParsed = TransactionIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildValidationDetails(idParsed.error),
    };
  }

  const parsed = UpdateTransactionSchema.safeParse(input);
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

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select(
      'id,account_id,original_amount_cents,original_currency,transaction_date,merchant_raw,category_id,notes,deleted_at',
    )
    .eq('id', idParsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'FORBIDDEN' };
  }
  if (existing.deleted_at) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const existingRow: ExistingTransactionRow = existing;
  const nextInput: UpdateTransactionInput = parsed.data;
  const finalInput: CreateTransactionInput = {
    account_id: nextInput.account_id ?? existingRow.account_id,
    amount_cents: nextInput.amount_cents ?? dbIntToBigint(existingRow.original_amount_cents),
    currency: nextInput.currency ?? existingRow.original_currency,
    transaction_date: nextInput.transaction_date ?? existingRow.transaction_date,
    merchant_raw:
      nextInput.merchant_raw !== undefined ? nextInput.merchant_raw : existingRow.merchant_raw,
    merchant_id: null,
    category_id:
      nextInput.category_id !== undefined ? nextInput.category_id : existingRow.category_id,
    notes: nextInput.notes !== undefined ? nextInput.notes : existingRow.notes,
  };

  const ownedAccount = await ensureOwnedAccount(supabase, user.id, finalInput.account_id);
  if (!ownedAccount.ok) {
    return { success: false, error: ownedAccount.error };
  }

  const ownedCategory = await ensureOwnedCategory(supabase, user.id, finalInput.category_id);
  if (!ownedCategory.ok) {
    return { success: false, error: ownedCategory.error };
  }

  const baseCurrencyResult = await getBaseCurrency(supabase, user.id);
  if (!baseCurrencyResult.ok) {
    return { success: false, error: 'DATABASE_ERROR' };
  }

  let fxResult: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxResult = await convertToBase(
      finalInput.amount_cents,
      finalInput.currency,
      baseCurrencyResult.value,
      finalInput.transaction_date,
    );
  } catch (error) {
    console.error('update_transaction_fx_error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const dedupHash = computeDedupHash({
    account_id: finalInput.account_id,
    amount_cents: finalInput.amount_cents,
    date: finalInput.transaction_date,
    merchant: finalInput.merchant_raw,
  });

  const duplicate = await findDuplicateTransaction(supabase, {
    userId: user.id,
    dedupHash,
    transactionDate: finalInput.transaction_date,
    excludeId: existingRow.id,
  });
  if (duplicate) {
    return { success: false, error: 'DUPLICATE', duplicateId: duplicate.id };
  }

  const patch: TransactionUpdate = {
    account_id: finalInput.account_id,
    original_amount_cents: bigintToDbInt(finalInput.amount_cents),
    original_currency: finalInput.currency,
    base_amount_cents: bigintToDbInt(fxResult.baseCents),
    base_currency: baseCurrencyResult.value,
    fx_rate: fxResult.fxRate,
    fx_rate_date: fxResult.fxRateDate,
    fx_stale: fxResult.fxStale,
    transaction_date: finalInput.transaction_date,
    merchant_raw: finalInput.merchant_raw,
    category_id: finalInput.category_id,
    category_source: finalInput.category_id ? 'user' : null,
    notes: finalInput.notes,
    dedup_hash: dedupHash,
  };

  const { error: updateError } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', existingRow.id)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (updateError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateTransactionViews([existingRow.account_id, finalInput.account_id]);
  return { success: true };
}

export async function deleteTransaction(id: unknown): Promise<DeleteTransactionResult> {
  const parsed = TransactionIdSchema.safeParse(id);
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

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('id,account_id,deleted_at')
    .eq('id', parsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'FORBIDDEN' };
  }
  if (existing.deleted_at) {
    return { success: true };
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteError } = await supabase
    .from('transactions')
    .update({ deleted_at: deletedAt })
    .eq('id', parsed.data)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (deleteError) {
    console.error('delete_transaction', {
      code: deleteError.code,
      message: deleteError.message,
      details: deleteError.details,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateTransactionViews([existing.account_id]);
  return { success: true };
}

export async function restoreTransaction(id: unknown): Promise<RestoreTransactionResult> {
  const parsed = TransactionIdSchema.safeParse(id);
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

  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('id,account_id,deleted_at')
    .eq('id', parsed.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'FORBIDDEN' };
  }
  if (!existing.deleted_at) {
    return { success: true };
  }

  const { error: restoreError } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', parsed.data)
    .eq('user_id', user.id);

  if (restoreError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateTransactionViews([existing.account_id]);
  return { success: true };
}

export async function bulkDeleteTransactions(ids: unknown): Promise<BulkDeleteTransactionsResult> {
  const parsed = BulkDeleteTransactionIdsSchema.safeParse(ids);
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

  const txIds = parsed.data;
  const { data: ownedRows, error: ownedError } = await supabase
    .from('transactions')
    .select('id,account_id')
    .eq('user_id', user.id)
    .in('id', txIds)
    .is('deleted_at', null);

  if (ownedError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (ownedRows.length !== txIds.length) {
    return { success: false, error: 'FORBIDDEN' };
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteError } = await supabase
    .from('transactions')
    .update({ deleted_at: deletedAt })
    .eq('user_id', user.id)
    .in('id', txIds)
    .is('deleted_at', null);

  if (deleteError) {
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateTransactionViews(ownedRows.map((row) => row.account_id));
  return { success: true, data: { count: txIds.length } };
}
