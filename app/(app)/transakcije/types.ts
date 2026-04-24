export interface TransactionAccountRef {
  id: string;
  name: string;
  currency: string;
}

export interface TransactionCategoryRef {
  id: string;
  name: string;
  icon: string | null;
  kind: string;
}

export interface TransactionMerchantRef {
  id: string;
  display_name: string;
  icon: string | null;
}

export interface TransactionListItem {
  id: string;
  transaction_date: string;
  original_amount_cents: number;
  original_currency: string;
  merchant_raw: string | null;
  description: string | null;
  notes: string | null;
  is_transfer: boolean;
  fx_stale: boolean;
  account: TransactionAccountRef | null;
  category: TransactionCategoryRef | null;
  merchant: TransactionMerchantRef | null;
}

export interface TransactionsFilters {
  accountIds: string[];
  categoryIds: string[];
  from: string;
  to: string;
  search: string;
  page: number;
  type: 'income' | 'expense' | 'transfer' | '';
}
