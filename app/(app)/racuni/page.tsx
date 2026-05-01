import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { AccountsClient } from '@/app/(app)/racuni/accounts-client';
import {
  ACCOUNT_TYPE_GROUP_ORDER,
  type AccountType,
  getAccountTypeLabel,
} from '@/lib/accounts/constants';
import { convertCentsToBase } from '@/lib/queries/summary';
import type { Account } from '@/lib/supabase/types';
import type { AccountGroup, AccountsFilters } from '@/app/(app)/racuni/types';

const SEARCH_MAX_LENGTH = 100;

const ACCOUNT_TYPE_SET = new Set<string>(ACCOUNT_TYPE_GROUP_ORDER);

function parseStringList(value: string | string[] | undefined, allowed: Set<string>): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && allowed.has(s));
  return Array.from(new Set(items));
}

function parseFilters(
  params: Record<string, string | string[] | undefined>,
  availableCurrencies: string[],
): AccountsFilters {
  const searchCandidate = Array.isArray(params.search) ? params.search[0] : params.search;
  return {
    type: parseStringList(params.type, ACCOUNT_TYPE_SET),
    currency: parseStringList(params.currency, new Set(availableCurrencies)),
    search: (searchCandidate ?? '').trim().slice(0, SEARCH_MAX_LENGTH),
  };
}

function escapeLike(input: string): string {
  return input.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function groupAccountsByType(accounts: Account[], baseCurrency: string): AccountGroup[] {
  const buckets = new Map<AccountType, Account[]>();
  for (const account of accounts) {
    const type = (ACCOUNT_TYPE_SET.has(account.type) ? account.type : 'other') as AccountType;
    const current = buckets.get(type);
    if (current) {
      current.push(account);
    } else {
      buckets.set(type, [account]);
    }
  }

  const groups: AccountGroup[] = [];
  for (const type of ACCOUNT_TYPE_GROUP_ORDER) {
    const bucket = buckets.get(type);
    if (!bucket || bucket.length === 0) continue;
    const { emoji, label } = getAccountTypeLabel(type);
    let subtotal = 0n;
    for (const account of bucket) {
      const cents = BigInt(Math.trunc(account.current_balance_cents));
      subtotal += convertCentsToBase(cents, account.currency, baseCurrency);
    }
    groups.push({
      type,
      emoji,
      label,
      accounts: bucket,
      subtotalBaseCents: subtotal,
      baseCurrency,
    });
  }
  return groups;
}

interface RacuniListPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RacuniListPage({ searchParams }: RacuniListPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const params = await searchParams;

  // Currencies the user actually owns (so the filter chips reflect reality
  // even after a query that returns zero rows).
  const { data: allUserAccounts } = await supabase
    .from('accounts')
    .select('currency')
    .eq('user_id', user.id)
    .is('deleted_at', null);

  const availableCurrencies = Array.from(
    new Set((allUserAccounts ?? []).map((a) => a.currency.toUpperCase())),
  ).sort();

  const filters = parseFilters(params, availableCurrencies);
  const totalCount = allUserAccounts?.length ?? 0;

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  const baseCurrency = profile?.base_currency ?? 'BAM';

  let query = supabase.from('accounts').select('*').eq('user_id', user.id).is('deleted_at', null);

  if (filters.type.length > 0) {
    query = query.in('type', filters.type);
  }
  if (filters.currency.length > 0) {
    query = query.in('currency', filters.currency);
  }
  if (filters.search.length > 0) {
    const like = `%${escapeLike(filters.search)}%`;
    query = query.or(`name.ilike.${like},institution.ilike.${like}`);
  }

  const { data: raw, error } = await query.order('sort_order', { ascending: true });
  const accounts = raw ?? [];

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <p className="text-destructive">Ne mogu učitati račune. Pokušaj osvježiti stranicu.</p>
      </div>
    );
  }

  const groups = groupAccountsByType(accounts, baseCurrency);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Računi</h2>
        <Button asChild className="h-11 w-full shrink-0 sm:w-auto" data-testid="add-account">
          <Link href="/racuni/novi" className="inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj račun
          </Link>
        </Button>
      </div>

      {totalCount === 0 ? (
        <div
          className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center"
          data-testid="empty-accounts"
        >
          <span className="text-4xl" aria-hidden>
            🪴
          </span>
          <p className="text-lg font-medium">Još nema računa. Dodaj prvi da počneš.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Račun može biti banka, gotovina, Revolut, Wise i slično — tu će se zbrajati transakcije.
          </p>
          <Button asChild className="h-11 w-full max-w-xs">
            <Link href="/racuni/novi">Dodaj račun</Link>
          </Button>
        </div>
      ) : (
        <AccountsClient
          groups={groups}
          filters={filters}
          availableCurrencies={availableCurrencies}
          baseCurrency={baseCurrency}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}
