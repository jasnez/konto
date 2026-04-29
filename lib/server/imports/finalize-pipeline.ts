import { computeDedupHash } from '@/lib/dedup';
import { resolveFxRatesForBatch } from '@/lib/fx/batch-resolver';
import { toCents } from '@/lib/fx/convert';
import { logSafe, logWarn } from '@/lib/logger';
import {
  STORAGE_BUCKET,
  bigintToDbInt,
  extractImportedCount,
  parseDedupSkipIndices,
  type SupabaseClient,
} from '@/lib/server/actions/imports/shared';
import type {
  FilterDuplicatesResult,
  LoadFinalizeContextResult,
  PersistFinalizedBatchResult,
  PrepareImportRowsResult,
  PreparedImportRow,
  FinalizeContext,
} from './finalize-types';

export interface FinalizeDependencies {
  fxResolver: typeof resolveFxRatesForBatch;
}

const defaultDeps: FinalizeDependencies = {
  fxResolver: resolveFxRatesForBatch,
};

/** Phase 1: Load batch + ownership check + staging + profile + account. Pure reads. */
export async function loadFinalizeContext(
  supabase: SupabaseClient,
  userId: string,
  batchId: string,
): Promise<LoadFinalizeContextResult> {
  const { data: batch, error: bErr } = await supabase
    .from('import_batches')
    .select('id, status, account_id, storage_path')
    .eq('id', batchId)
    .eq('user_id', userId)
    .maybeSingle();

  if (bErr) {
    logSafe('finalize_import_load', { userId, error: bErr.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (!batch) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (batch.status !== 'ready' || !batch.account_id) {
    return { ok: false, error: 'BAD_STATE' };
  }

  const accountId = batch.account_id;

  const { data: staged, error: sErr } = await supabase
    .from('parsed_transactions')
    .select(
      'id, transaction_date, amount_minor, currency, raw_description, merchant_id, category_id, categorization_source, categorization_confidence',
    )
    .eq('batch_id', batchId)
    .eq('user_id', userId)
    .eq('status', 'pending_review')
    .eq('selected_for_import', true)
    .order('transaction_date', { ascending: true });

  if (sErr) {
    logSafe('finalize_import_staged', { userId, error: sErr.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  const staging = staged.filter((r) => r.amount_minor !== 0);
  if (staging.length === 0) {
    return { ok: false, error: 'BAD_STATE' };
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', userId)
    .maybeSingle();
  if (pErr) {
    logSafe('finalize_import_profile', { userId, error: pErr.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  const baseCurrency = profile?.base_currency ?? 'BAM';

  const { data: importAccount, error: acctErr } = await supabase
    .from('accounts')
    .select('currency')
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (acctErr) {
    logSafe('finalize_import_account', { userId, error: acctErr.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  if (!importAccount) {
    return { ok: false, error: 'NOT_FOUND' };
  }

  return {
    ok: true,
    ctx: {
      batch: {
        id: batch.id,
        status: batch.status,
        account_id: accountId,
        storage_path: batch.storage_path,
      },
      baseCurrency,
      accountCurrency: importAccount.currency,
      staging,
    },
  };
}

/**
 * Phase 2: Resolve FX rates in parallel + compute prepared rows with dedup hash.
 * Caller is responsible for `markBatchFailed` on EXTERNAL_SERVICE_ERROR — this
 * function stays pure.
 */
export async function prepareImportRows(
  ctx: FinalizeContext,
  userId: string,
  deps: FinalizeDependencies = defaultDeps,
): Promise<PrepareImportRowsResult> {
  const { batch, baseCurrency, accountCurrency, staging } = ctx;
  const accountId = batch.account_id;

  let fxCache;
  try {
    fxCache = await deps.fxResolver(staging, baseCurrency, accountCurrency);
  } catch (error) {
    logSafe('finalize_import_fx_batch', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const prepared: PreparedImportRow[] = [];
  for (const row of staging) {
    const fromCurrency = row.currency.trim().toUpperCase();
    const baseCurrencyNorm = baseCurrency.trim().toUpperCase();
    const accountCurrencyNorm = accountCurrency.trim().toUpperCase();

    const fxKey = `${fromCurrency}|${baseCurrencyNorm}|${row.transaction_date}`;
    const baseFxRate = fxCache.get(fxKey);
    if (!baseFxRate) {
      logSafe('finalize_import_missing_fx_cache', { userId, key: fxKey });
      return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
    }

    const baseCents = toCents(BigInt(row.amount_minor), baseFxRate.fxRate);

    let ledgerCents: bigint;
    if (fromCurrency === accountCurrencyNorm) {
      ledgerCents = BigInt(row.amount_minor);
    } else if (baseCurrencyNorm === accountCurrencyNorm) {
      ledgerCents = baseCents;
    } else {
      const ledgerKey = `${fromCurrency}|${accountCurrencyNorm}|${row.transaction_date}`;
      const ledgerFxRate = fxCache.get(ledgerKey);
      if (!ledgerFxRate) {
        logSafe('finalize_import_missing_ledger_fx_cache', { userId, key: ledgerKey });
        return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
      }
      ledgerCents = toCents(BigInt(row.amount_minor), ledgerFxRate.fxRate);
    }

    const dedupHash = computeDedupHash({
      account_id: accountId,
      amount_cents: BigInt(row.amount_minor),
      date: row.transaction_date,
      merchant: row.raw_description,
    });

    prepared.push({
      account_id: accountId,
      original_amount_cents: row.amount_minor,
      original_currency: row.currency,
      base_amount_cents: bigintToDbInt(baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: bigintToDbInt(ledgerCents),
      fx_rate: baseFxRate.fxRate,
      fx_rate_date: baseFxRate.fxRateDate,
      fx_stale: baseFxRate.fxStale,
      transaction_date: row.transaction_date,
      merchant_raw: row.raw_description,
      merchant_id: row.merchant_id,
      category_id: row.category_id,
      category_source: row.category_id ? (row.categorization_source ?? 'user') : null,
      category_confidence: row.category_id ? (row.categorization_confidence ?? 1) : null,
      dedup_hash: dedupHash,
    });
  }

  return { ok: true, prepared };
}

/**
 * Phase 3: Dedup filter via RPC. Returns the rows to insert and how many were
 * skipped as duplicates.
 */
export async function filterDuplicates(
  supabase: SupabaseClient,
  accountId: string,
  prepared: PreparedImportRow[],
  userId: string,
): Promise<FilterDuplicatesResult> {
  const dedupPayload = prepared.map((r) => ({
    transaction_date: r.transaction_date,
    original_amount_cents: r.original_amount_cents,
    merchant_raw: r.merchant_raw,
  }));

  const { data: rawSkip, error: dedupErr } = await supabase.rpc('import_dedup_filter', {
    p_account_id: accountId,
    p_rows: dedupPayload,
  });
  if (dedupErr) {
    logSafe('finalize_import_dedup', { userId, error: dedupErr.message });
    return { ok: false, error: 'DATABASE_ERROR' };
  }
  const skip = parseDedupSkipIndices(rawSkip, prepared.length);
  const toInsert = prepared.filter((_, i) => !skip.has(i));
  return { ok: true, toInsert, skipped: skip.size };
}

/**
 * Phase 4: Atomic RPC (insert transactions, delete staging, mark batch) + best-effort
 * storage cleanup. The DB transaction has already committed by the time storage runs,
 * so storage failures are non-fatal.
 */
export async function persistFinalizedBatch(
  supabase: SupabaseClient,
  batchId: string,
  userId: string,
  toInsert: PreparedImportRow[],
  skipped: number,
  storagePath: string | null,
): Promise<PersistFinalizedBatchResult> {
  const rpcPayload = toInsert.map((r) => ({
    account_id: r.account_id,
    original_amount_cents: r.original_amount_cents,
    original_currency: r.original_currency,
    base_amount_cents: r.base_amount_cents,
    base_currency: r.base_currency,
    account_ledger_cents: r.account_ledger_cents,
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
    p_dedup_skipped: skipped,
  });

  if (rpcErr) {
    const msg = rpcErr.message;
    if (msg.includes('UNAUTHORIZED')) return { ok: false, error: 'UNAUTHORIZED' };
    if (msg.includes('NOT_FOUND')) return { ok: false, error: 'NOT_FOUND' };
    if (msg.includes('BAD_STATE')) return { ok: false, error: 'BAD_STATE' };
    logSafe('finalize_import_rpc', { userId, error: msg });
    return { ok: false, error: 'DATABASE_ERROR' };
  }

  const imported = extractImportedCount(rpcData);

  if (storagePath) {
    const { error: rmErr } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    if (rmErr) {
      logWarn('finalize_import_storage_cleanup', { userId, error: rmErr.message });
    }
  }

  return { ok: true, imported };
}
