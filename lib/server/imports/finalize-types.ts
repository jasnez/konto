import type { Database } from '@/supabase/types';

export type StagingRow = Pick<
  Database['public']['Tables']['parsed_transactions']['Row'],
  | 'id'
  | 'transaction_date'
  | 'amount_minor'
  | 'currency'
  | 'raw_description'
  | 'merchant_id'
  | 'category_id'
  | 'categorization_source'
  | 'categorization_confidence'
>;

export interface FinalizeBatch {
  id: string;
  status: string;
  account_id: string;
  storage_path: string | null;
}

export interface FinalizeContext {
  batch: FinalizeBatch;
  baseCurrency: string;
  accountCurrency: string;
  staging: StagingRow[];
}

export interface PreparedImportRow {
  account_id: string;
  original_amount_cents: number;
  original_currency: string;
  base_amount_cents: number;
  base_currency: string;
  account_ledger_cents: number;
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

export type LoadFinalizeContextResult =
  | { ok: true; ctx: FinalizeContext }
  | { ok: false; error: 'NOT_FOUND' | 'BAD_STATE' | 'DATABASE_ERROR' };

export type PrepareImportRowsResult =
  | { ok: true; prepared: PreparedImportRow[] }
  | { ok: false; error: 'EXTERNAL_SERVICE_ERROR' };

export type FilterDuplicatesResult =
  | { ok: true; toInsert: PreparedImportRow[]; skipped: number }
  | { ok: false; error: 'DATABASE_ERROR' };

export type PersistFinalizedBatchResult =
  | { ok: true; imported: number }
  | { ok: false; error: 'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_STATE' | 'DATABASE_ERROR' };
