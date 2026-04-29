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
      'id, transaction_date, amount_minor, currency, raw_description, merchant_id, category_id, categorization_source, categorization_confidence, convert_to_transfer_to_account_id',
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

  // Pre-load destination account currencies for any row that's been flagged
  // for transfer-pair conversion. We need these up front so prepareImportRows
  // can pre-compute FX cross rates for the to-leg without going back to the DB.
  const destAccountIds = Array.from(
    new Set(
      staging
        .map((row) => row.convert_to_transfer_to_account_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  const destAccountCurrencies = new Map<string, string>();
  if (destAccountIds.length > 0) {
    const { data: destAccounts, error: destErr } = await supabase
      .from('accounts')
      .select('id, currency')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('id', destAccountIds);

    if (destErr) {
      logSafe('finalize_import_dest_accounts', { userId, error: destErr.message });
      return { ok: false, error: 'DATABASE_ERROR' };
    }
    if (destAccounts.length !== destAccountIds.length) {
      // A flagged destination is missing or no longer the user's. Reject the
      // batch — the user must clear the conversion before re-trying.
      return { ok: false, error: 'NOT_FOUND' };
    }
    for (const acc of destAccounts) {
      destAccountCurrencies.set(acc.id, acc.currency);
    }
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
      destAccountCurrencies,
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
  const { batch, baseCurrency, accountCurrency, staging, destAccountCurrencies } = ctx;
  const accountId = batch.account_id;

  // Tag each staging row with the destination currency (if any) so the FX
  // resolver can also pre-compute the cross-currency rates we'll need to
  // price the to-leg of a transfer pair.
  const fxRows = staging.map((row) => ({
    currency: row.currency,
    transaction_date: row.transaction_date,
    destCurrency: row.convert_to_transfer_to_account_id
      ? destAccountCurrencies.get(row.convert_to_transfer_to_account_id)
      : undefined,
  }));

  let fxCache;
  try {
    fxCache = await deps.fxResolver(fxRows, baseCurrency, accountCurrency);
  } catch (error) {
    logSafe('finalize_import_fx_batch', {
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const baseCurrencyNorm = baseCurrency.trim().toUpperCase();
  const accountCurrencyNorm = accountCurrency.trim().toUpperCase();

  const prepared: PreparedImportRow[] = [];
  for (const row of staging) {
    const fromCurrency = row.currency.trim().toUpperCase();

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

    // Default the to-leg fields to null. Populated below when the row is
    // flagged for transfer-pair conversion.
    let toLeg: {
      original_amount_cents: number;
      original_currency: string;
      base_amount_cents: number;
      account_ledger_cents: number;
      fx_rate: number;
      fx_rate_date: string;
      fx_stale: boolean;
    } | null = null;

    if (row.convert_to_transfer_to_account_id) {
      const destCurrency = destAccountCurrencies.get(row.convert_to_transfer_to_account_id);
      if (!destCurrency) {
        // Defensive: loadFinalizeContext should have failed already.
        return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
      }
      const destCurrencyNorm = destCurrency.trim().toUpperCase();

      // Source amount in the bank statement is signed (e.g. -10000 cents for
      // an ATM withdrawal). The to-leg credits the cash account by the
      // absolute value, in the cash account's own currency.
      const fromCents = BigInt(row.amount_minor);
      const absFromCents = fromCents < 0n ? -fromCents : fromCents;

      let toAmountCents: bigint;
      if (destCurrencyNorm === fromCurrency) {
        toAmountCents = absFromCents;
      } else {
        const crossKey = `${fromCurrency}|${destCurrencyNorm}|${row.transaction_date}`;
        const crossRate = fxCache.get(crossKey);
        if (!crossRate) {
          logSafe('finalize_import_missing_cross_fx_cache', { userId, key: crossKey });
          return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
        }
        toAmountCents = toCents(absFromCents, crossRate.fxRate);
      }

      let toBaseRate;
      if (destCurrencyNorm === baseCurrencyNorm) {
        toBaseRate = {
          fxRate: 1,
          fxRateDate: baseFxRate.fxRateDate,
          fxSource: 'identity' as const,
          fxStale: false,
        };
      } else {
        const toBaseKey = `${destCurrencyNorm}|${baseCurrencyNorm}|${row.transaction_date}`;
        const cached = fxCache.get(toBaseKey);
        if (!cached) {
          logSafe('finalize_import_missing_to_base_fx_cache', { userId, key: toBaseKey });
          return { ok: false, error: 'EXTERNAL_SERVICE_ERROR' };
        }
        toBaseRate = cached;
      }

      const toBaseCents = toCents(toAmountCents, toBaseRate.fxRate);

      toLeg = {
        original_amount_cents: bigintToDbInt(toAmountCents),
        original_currency: destCurrency,
        base_amount_cents: bigintToDbInt(toBaseCents),
        account_ledger_cents: bigintToDbInt(toAmountCents),
        fx_rate: toBaseRate.fxRate,
        fx_rate_date: toBaseRate.fxRateDate,
        fx_stale: toBaseRate.fxStale,
      };
    }

    const dedupHash = computeDedupHash({
      account_id: accountId,
      amount_cents: BigInt(row.amount_minor),
      date: row.transaction_date,
      merchant: row.raw_description,
    });

    prepared.push({
      account_id: accountId,
      to_account_id: row.convert_to_transfer_to_account_id,
      original_amount_cents: row.amount_minor,
      original_currency: row.currency,
      base_amount_cents: bigintToDbInt(baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: bigintToDbInt(ledgerCents),
      fx_rate: baseFxRate.fxRate,
      fx_rate_date: baseFxRate.fxRateDate,
      fx_stale: baseFxRate.fxStale,
      to_original_amount_cents: toLeg?.original_amount_cents ?? null,
      to_original_currency: toLeg?.original_currency ?? null,
      to_base_amount_cents: toLeg?.base_amount_cents ?? null,
      to_account_ledger_cents: toLeg?.account_ledger_cents ?? null,
      to_fx_rate: toLeg?.fx_rate ?? null,
      to_fx_rate_date: toLeg?.fx_rate_date ?? null,
      to_fx_stale: toLeg?.fx_stale ?? null,
      transaction_date: row.transaction_date,
      merchant_raw: row.raw_description,
      merchant_id: row.merchant_id,
      // Transfers carry no merchant or category at the data layer.
      category_id: row.convert_to_transfer_to_account_id ? null : row.category_id,
      category_source: row.convert_to_transfer_to_account_id
        ? null
        : row.category_id
          ? (row.categorization_source ?? 'user')
          : null,
      category_confidence: row.convert_to_transfer_to_account_id
        ? null
        : row.category_id
          ? (row.categorization_confidence ?? 1)
          : null,
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
    to_account_id: r.to_account_id,
    original_amount_cents: r.original_amount_cents,
    original_currency: r.original_currency,
    base_amount_cents: r.base_amount_cents,
    base_currency: r.base_currency,
    account_ledger_cents: r.account_ledger_cents,
    fx_rate: r.fx_rate,
    fx_rate_date: r.fx_rate_date,
    fx_stale: r.fx_stale,
    to_original_amount_cents: r.to_original_amount_cents,
    to_original_currency: r.to_original_currency,
    to_base_amount_cents: r.to_base_amount_cents,
    to_account_ledger_cents: r.to_account_ledger_cents,
    to_fx_rate: r.to_fx_rate,
    to_fx_rate_date: r.to_fx_rate_date,
    to_fx_stale: r.to_fx_stale,
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
