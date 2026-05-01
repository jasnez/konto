import type { Account } from '@/lib/supabase/types';
import type { AccountType } from '@/lib/accounts/constants';

export interface AccountsFilters {
  type: string[];
  currency: string[];
  search: string;
}

export interface AccountGroup {
  type: AccountType;
  emoji: string;
  label: string;
  accounts: Account[];
  subtotalBaseCents: bigint;
  baseCurrency: string;
}

/** Compact preview of an account's most recent transaction, surfaced on
 * the account card so users see "what's happening" without drilling into
 * the detail page (audit R7). */
export interface AccountLastTransaction {
  merchantLabel: string;
  transactionDate: string;
}
