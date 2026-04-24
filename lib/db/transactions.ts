import type { DbClient, TransactionInsert } from './types';

const LIST_COLS =
  'id, transaction_date, amount_cents, base_amount_cents, base_currency, currency, merchant_raw, merchant_id, category_id, account_id, notes, is_transfer, is_excluded, is_pending, transfer_pair_id, dedup_hash, deleted_at' as const;

/**
 * Returns live transactions for a user within an optional date window,
 * ordered newest-first. The date window must be provided when querying large
 * data sets (e.g., /uvoz duplicate check, /budzet month aggregation) to keep
 * the query bounded.
 */
export async function listTransactions(
  supabase: DbClient,
  userId: string,
  options: {
    accountId?: string;
    categoryId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  } = {},
) {
  let q = supabase
    .from('transactions')
    .select(LIST_COLS)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false });

  if (options.accountId) q = q.eq('account_id', options.accountId);
  if (options.categoryId) q = q.eq('category_id', options.categoryId);
  if (options.fromDate) q = q.gte('transaction_date', options.fromDate);
  if (options.toDate) q = q.lte('transaction_date', options.toDate);
  if (options.limit) q = q.limit(options.limit);

  return q;
}

/**
 * Finds a live transaction by id, scoped to the user. Used by edit/delete
 * guards where ownership must be confirmed before acting.
 */
export async function findActiveTransaction(
  supabase: DbClient,
  userId: string,
  transactionId: string,
) {
  return supabase
    .from('transactions')
    .select(LIST_COLS)
    .eq('id', transactionId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
}

/**
 * Finds any transaction (including soft-deleted) by id + userId. Used by the
 * restore flow.
 */
export async function findTransaction(supabase: DbClient, userId: string, transactionId: string) {
  return supabase
    .from('transactions')
    .select(LIST_COLS)
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle();
}

/**
 * Checks whether a transaction with the given dedup hash already exists for
 * the user within the last `lookbackDays` days. Returns the conflicting row
 * or null. Used by the duplicate-detection guard in createTransaction and the
 * /uvoz bulk-import flow.
 */
export async function findByDedupHash(
  supabase: DbClient,
  userId: string,
  dedupHash: string,
  lookbackDays = 30,
) {
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays);
  const fromIso = from.toISOString().slice(0, 10);

  return supabase
    .from('transactions')
    .select('id, transaction_date, amount_cents, merchant_raw')
    .eq('user_id', userId)
    .eq('dedup_hash', dedupHash)
    .is('deleted_at', null)
    .gte('transaction_date', fromIso)
    .maybeSingle();
}

/**
 * Inserts a single transaction and returns its id. Callers are responsible for
 * computing dedup_hash and base_amount_cents before calling this.
 */
export async function insertTransaction(supabase: DbClient, values: TransactionInsert) {
  return supabase.from('transactions').insert(values).select('id').single();
}

/**
 * Inserts multiple transactions in one round-trip. Used by /uvoz bulk import.
 * Returns the inserted ids on success.
 *
 * Note: Postgres processes the batch atomically — all-or-nothing. If any row
 * violates a constraint (e.g., invalid account_id FK), the whole batch rolls
 * back. For partial-success semantics, split into per-row calls.
 */
export async function insertManyTransactions(supabase: DbClient, rows: TransactionInsert[]) {
  return supabase.from('transactions').insert(rows).select('id');
}

/** Soft-deletes a transaction. Caller must verify ownership first. */
export async function softDeleteTransaction(
  supabase: DbClient,
  userId: string,
  transactionId: string,
) {
  return supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', transactionId)
    .eq('user_id', userId);
}

/** Restores a soft-deleted transaction. Idempotent. */
export async function restoreTransaction(
  supabase: DbClient,
  userId: string,
  transactionId: string,
) {
  return supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', transactionId)
    .eq('user_id', userId);
}
