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
 * the detail page (audit R7-light). */
export interface AccountLastTransaction {
  merchantLabel: string;
  transactionDate: string;
}

/** One point in the per-account balance series powering the sparkline on
 * /racuni cards (audit R7). One entry per calendar day; balance is the
 * end-of-day value in the account's native currency. Series length is
 * normally 30 (last 30 days, including today). */
export interface BalanceHistoryPoint {
  /** ISO YYYY-MM-DD. */
  day: string;
  /** End-of-day balance in account.currency. BigInt because cents can
   * exceed Number.MAX_SAFE_INTEGER for very large balances. */
  balanceCents: bigint;
}
