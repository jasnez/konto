import { cache } from 'react';
import type { Metadata } from 'next';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import type { PostgrestError } from '@supabase/supabase-js';
import { fetchTransferCounterpartyAccountNames } from '@/lib/db/transfer-counterparty-names';
import { createClient } from '@/lib/supabase/server';
import { TransactionsClient } from './transactions-client';
import type { TransactionListItem, TransactionsFilters } from './types';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption } from '@/components/category-select';

export const metadata: Metadata = {
  title: 'Transakcije — Konto',
};

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface FetchTransactionsResult {
  transactions: TransactionListItem[];
  totalCount: number;
}

interface RawTransactionRow {
  id: string;
  transaction_date: string;
  original_amount_cents: number;
  original_currency: string;
  merchant_raw: string | null;
  merchant_id: string | null;
  description: string | null;
  notes: string | null;
  is_transfer: boolean;
  fx_stale: boolean | null;
  transfer_pair_id: string | null;
  accounts: { id: string; name: string; currency: string };
  categories: { id: string; name: string; icon: string | null; kind: string } | null;
}

function isCategoryKind(value: string): value is CategoryOption['kind'] {
  return (
    value === 'expense' ||
    value === 'income' ||
    value === 'transfer' ||
    value === 'saving' ||
    value === 'investment'
  );
}

function hasQueryError(error: PostgrestError | null): error is PostgrestError {
  return error !== null;
}

function parseIdList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => UUID_PATTERN.test(item));
}

function parseFilters(params: Record<string, string | string[] | undefined>): TransactionsFilters {
  const now = new Date();
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd');

  const fromCandidate = Array.isArray(params.from) ? params.from[0] : params.from;
  const toCandidate = Array.isArray(params.to) ? params.to[0] : params.to;
  const searchCandidate = Array.isArray(params.search) ? params.search[0] : params.search;
  const pageCandidate = Array.isArray(params.page) ? params.page[0] : params.page;
  const typeCandidate = Array.isArray(params.type) ? params.type[0] : params.type;

  const pageNumber = Number(pageCandidate);

  return {
    accountIds: parseIdList(params.account),
    categoryIds: parseIdList(params.category),
    from: fromCandidate && fromCandidate.length > 0 ? fromCandidate : defaultFrom,
    to: toCandidate && toCandidate.length > 0 ? toCandidate : defaultTo,
    search: searchCandidate?.trim() ?? '',
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.floor(pageNumber) : 1,
    type:
      typeCandidate === 'income' || typeCandidate === 'expense' || typeCandidate === 'transfer'
        ? typeCandidate
        : '',
  };
}

function escapeLike(input: string): string {
  return input.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

async function fetchTransactionsUncached(
  userId: string,
  filters: TransactionsFilters,
): Promise<FetchTransactionsResult> {
  const supabase = await createClient();
  const fromIndex = (filters.page - 1) * PAGE_SIZE;
  const toIndex = fromIndex + PAGE_SIZE - 1;

  let countQuery = supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('transaction_date', filters.from)
    .lte('transaction_date', filters.to);

  let dataQuery = supabase
    .from('transactions')
    .select(
      'id,transaction_date,original_amount_cents,original_currency,merchant_raw,merchant_id,description,notes,is_transfer,fx_stale,transfer_pair_id,accounts(id,name,currency),categories(id,name,icon,kind)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('transaction_date', filters.from)
    .lte('transaction_date', filters.to)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(fromIndex, toIndex);

  if (filters.accountIds.length > 0) {
    countQuery = countQuery.in('account_id', filters.accountIds);
    dataQuery = dataQuery.in('account_id', filters.accountIds);
  }

  if (filters.categoryIds.length > 0) {
    countQuery = countQuery.in('category_id', filters.categoryIds);
    dataQuery = dataQuery.in('category_id', filters.categoryIds);
  }

  if (filters.type === 'income') {
    countQuery = countQuery.eq('is_transfer', false).gt('original_amount_cents', 0);
    dataQuery = dataQuery.eq('is_transfer', false).gt('original_amount_cents', 0);
  } else if (filters.type === 'expense') {
    countQuery = countQuery.eq('is_transfer', false).lt('original_amount_cents', 0);
    dataQuery = dataQuery.eq('is_transfer', false).lt('original_amount_cents', 0);
  } else if (filters.type === 'transfer') {
    countQuery = countQuery.eq('is_transfer', true);
    dataQuery = dataQuery.eq('is_transfer', true);
  }

  if (filters.search.length > 0) {
    const like = `%${escapeLike(filters.search)}%`;
    const orExpression = `merchant_raw.ilike.${like},description.ilike.${like},notes.ilike.${like}`;
    countQuery = countQuery.or(orExpression);
    dataQuery = dataQuery.or(orExpression);
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (hasQueryError(countError) || hasQueryError(dataError)) {
    console.error('transactions_page_query_failed', {
      userId,
      countError: countError?.message,
      dataError: dataError?.message,
    });
    return { transactions: [], totalCount: 0 };
  }

  const rawRows = data as RawTransactionRow[];
  const pairTargets = [
    ...new Set(
      rawRows.map((row) => row.transfer_pair_id).filter((value): value is string => value !== null),
    ),
  ];
  const counterpartyNames = await fetchTransferCounterpartyAccountNames(
    supabase,
    userId,
    pairTargets,
  );

  const merchantIds = rawRows
    .map((row) => row.merchant_id)
    .filter((value): value is string => value !== null);

  const merchantMap = new Map<string, { id: string; display_name: string; icon: string | null }>();
  if (merchantIds.length > 0) {
    const { data: merchantRows } = await supabase
      .from('merchants')
      .select('id,display_name,icon')
      .in('id', merchantIds)
      .eq('user_id', userId)
      .is('deleted_at', null);
    (merchantRows ?? []).forEach((merchant) => {
      merchantMap.set(merchant.id, merchant);
    });
  }

  const transactions = rawRows.map((row) => ({
    id: row.id,
    transaction_date: row.transaction_date,
    original_amount_cents: row.original_amount_cents,
    original_currency: row.original_currency,
    merchant_raw: row.merchant_raw,
    description: row.description,
    notes: row.notes,
    is_transfer: row.is_transfer,
    fx_stale: row.fx_stale === true,
    transfer_pair_id: row.transfer_pair_id,
    transfer_counterparty_account_name: row.transfer_pair_id
      ? (counterpartyNames.get(row.transfer_pair_id) ?? null)
      : null,
    account: { id: row.accounts.id, name: row.accounts.name, currency: row.accounts.currency },
    category: row.categories
      ? {
          id: row.categories.id,
          name: row.categories.name,
          icon: row.categories.icon,
          kind: row.categories.kind,
        }
      : null,
    merchant: row.merchant_id ? (merchantMap.get(row.merchant_id) ?? null) : null,
  }));

  return { transactions, totalCount: count ?? 0 };
}

const fetchTransactions = cache(fetchTransactionsUncached);

export default async function TransakcijePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFilters(params);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: accountsRaw }, { data: categoriesRaw }, txData] = await Promise.all([
    supabase
      .from('accounts')
      .select('id,name,currency,type')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id,name,icon,kind')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    fetchTransactions(user.id, filters),
  ]);

  const accounts: AccountOption[] = (accountsRaw ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type,
  }));

  const categories: CategoryOption[] = [];
  (categoriesRaw ?? []).forEach((category) => {
    if (!isCategoryKind(category.kind)) {
      return;
    }
    categories.push({
      id: category.id,
      name: category.name,
      icon: category.icon,
      kind: category.kind,
    });
  });

  const totalPages = Math.max(1, Math.ceil(txData.totalCount / PAGE_SIZE));

  return (
    <TransactionsClient
      transactions={txData.transactions}
      filters={filters}
      accounts={accounts}
      categories={categories}
      totalCount={txData.totalCount}
      totalPages={totalPages}
    />
  );
}
