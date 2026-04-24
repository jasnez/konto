import type { SupabaseClient } from '@supabase/supabase-js';
import { computeDedupHash } from '@/lib/dedup';
import { convertToBase } from '@/lib/fx/convert';
import type { Database } from '@/supabase/types';

type Client = SupabaseClient<Database>;

function bigintToDbInt(value: bigint): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is outside safe integer range for DB client transport.');
  }
  return Number(value);
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

async function findDuplicateTransaction(
  supabase: Client,
  input: { userId: string; dedupHash: string; transactionDate: string },
): Promise<{ id: string } | null> {
  const windowStart = buildDuplicateWindowStart(input.transactionDate);
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', input.userId)
    .eq('dedup_hash', input.dedupHash)
    .is('deleted_at', null)
    .gte('transaction_date', windowStart)
    .lte('transaction_date', input.transactionDate)
    .order('transaction_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return { id: data.id };
}

export interface PersistPdfImportTxParams {
  userId: string;
  accountId: string;
  batchId: string;
  transactionDate: string;
  amountMinor: bigint;
  currency: string;
  merchantRaw: string;
  merchantId: string | null;
  categoryId: string | null;
}

export type PersistPdfImportTxResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: 'DUPLICATE'; duplicateId: string }
  | { ok: false; error: 'DATABASE_ERROR' }
  | { ok: false; error: 'EXTERNAL_SERVICE_ERROR' };

/**
 * Inserts one bank PDF transaction (same invariants as manual create, but `source` = import_pdf).
 */
export async function persistPdfImportTransaction(
  supabase: Client,
  params: PersistPdfImportTxParams,
): Promise<PersistPdfImportTxResult> {
  const baseCurrencyResult = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', params.userId)
    .maybeSingle();

  if (baseCurrencyResult.error) {
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  const baseCurrency = baseCurrencyResult.data?.base_currency ?? 'BAM';

  let fxResult: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxResult = await convertToBase(
      params.amountMinor,
      params.currency,
      baseCurrency,
      params.transactionDate,
    );
  } catch (error) {
    console.error('import_persist_fx_error', {
      userId: params.userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const dedupHash = computeDedupHash({
    account_id: params.accountId,
    amount_cents: params.amountMinor,
    date: params.transactionDate,
    merchant: params.merchantRaw,
  });

  const duplicate = await findDuplicateTransaction(supabase, {
    userId: params.userId,
    dedupHash,
    transactionDate: params.transactionDate,
  });
  if (duplicate) {
    return { ok: false, error: 'DUPLICATE', duplicateId: duplicate.id };
  }

  const categorySource = params.categoryId ? ('user' as const) : null;

  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      account_id: params.accountId,
      original_amount_cents: bigintToDbInt(params.amountMinor),
      original_currency: params.currency,
      base_amount_cents: bigintToDbInt(fxResult.baseCents),
      base_currency: baseCurrency,
      fx_rate: fxResult.fxRate,
      fx_rate_date: fxResult.fxRateDate,
      fx_stale: fxResult.fxStale,
      transaction_date: params.transactionDate,
      merchant_raw: params.merchantRaw,
      merchant_id: params.merchantId,
      category_id: params.categoryId,
      category_source: categorySource,
      source: 'import_pdf',
      import_batch_id: params.batchId,
      dedup_hash: dedupHash,
    })
    .select('id')
    .single();

  if (error) {
    console.error('import_persist_insert_error', { userId: params.userId, error: error.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  return { ok: true, transactionId: tx.id };
}
