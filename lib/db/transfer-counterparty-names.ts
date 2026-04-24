import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

/**
 * For each paired transaction id, returns the **account display name** on that row
 * (the counterparty account name relative to the sibling leg).
 */
export async function fetchTransferCounterpartyAccountNames(
  supabase: SupabaseClient<Database>,
  userId: string,
  pairedTransactionIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(pairedTransactionIds.filter((id) => id.length > 0))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from('transactions')
    .select('id, accounts(name)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('id', unique);

  if (error) {
    return map;
  }

  for (const row of data) {
    const name = row.accounts.name.trim();
    map.set(row.id, name.length > 0 ? name : 'Račun');
  }
  return map;
}
