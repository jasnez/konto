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
