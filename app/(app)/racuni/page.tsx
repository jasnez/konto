import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { AccountsClient } from '@/app/(app)/racuni/accounts-client';
import {
  ACCOUNT_TYPE_GROUP_ORDER,
  type AccountType,
  getAccountTypeLabel,
} from '@/lib/accounts/constants';
import { getTransactionPrimaryLabel } from '@/lib/format/transaction-primary-label';
import { convertCentsToBase } from '@/lib/queries/summary';
import type { Account } from '@/lib/supabase/types';
import type {
  AccountGroup,
  AccountLastTransaction,
  AccountsFilters,
  BalanceHistoryPoint,
} from '@/app/(app)/racuni/types';

interface LastTxRow {
  account_id: string;
  transaction_date: string;
  original_amount_cents: number;
  merchant_raw: string | null;
  description: string | null;
  is_transfer: boolean;
  merchants: { display_name: string } | null;
}

/** Raw row shape of `get_account_balance_history` RPC (migration 00050). */
interface BalanceHistoryRow {
  account_id: string;
  day: string;
  balance_cents: number;
}

/** Group RPC rows into a per-account series, sorted by day ascending.
 * The RPC already orders by (account_id, day) — we trust that order so we
 * skip a redundant sort, but tolerate out-of-order data defensively. */
function buildBalanceHistoryMap(rows: BalanceHistoryRow[]): Map<string, BalanceHistoryPoint[]> {
  const byAccount = new Map<string, BalanceHistoryPoint[]>();
  for (const row of rows) {
    const list = byAccount.get(row.account_id);
    const point: BalanceHistoryPoint = {
      day: row.day,
      balanceCents: BigInt(row.balance_cents),
    };
    if (list) {
      list.push(point);
    } else {
      byAccount.set(row.account_id, [point]);
    }
  }
  // Defensive sort — RPC ORDER BY should already deliver this, but a future
  // migration that joins or unions might break the guarantee silently.
  for (const list of byAccount.values()) {
    list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  }
  return byAccount;
}

/** Build a per-account map of the most recent transaction. Pulls one
 * generous batch of recent transactions (50) and keeps the first hit
 * per `account_id` — cheap and accurate for typical Konto users (~5-10
 * accounts). Accounts with zero activity simply don't appear in the map. */
function buildLastTransactionMap(rows: LastTxRow[]): Map<string, AccountLastTransaction> {
  const seen = new Map<string, AccountLastTransaction>();
  for (const row of rows) {
    if (seen.has(row.account_id)) continue;
    seen.set(row.account_id, {
      merchantLabel: getTransactionPrimaryLabel({
        merchant_display_name: row.merchants?.display_name,
        merchant_raw: row.merchant_raw,
        description: row.description,
        is_transfer: row.is_transfer,
        original_amount_cents: row.original_amount_cents,
        // Account labels not needed for "Zadnja: <merchant>" preview.
        account_name: null,
        transfer_counterparty_account_name: null,
      }),
      transactionDate: row.transaction_date,
    });
  }
  return seen;
}

/** Sum of in-scope (include_in_net_worth=true) account balances in base currency.
 * Mirrors the dashboard's "Aktiva" so the user sees the same number on both
 * pages (audit R2). */
function computeAktivaInScopeCents(accounts: Account[], baseCurrency: string): bigint {
  let total = 0n;
  for (const account of accounts) {
    if (!account.include_in_net_worth) continue;
    const cents = BigInt(Math.trunc(account.current_balance_cents));
    total += convertCentsToBase(cents, account.currency, baseCurrency);
  }
  return total;
}

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

  // Pull the columns we need from EVERY account (not just the filtered
  // query result) so two unrelated bits of UI stay accurate while the user
  // narrows the list:
  //   - filter chips reflect every currency the user actually owns
  //     (otherwise filtering all accounts out hides currency chips)
  //   - the "Stanje aktiva" hero number above the filters stays stable
  //     while the user searches/filters
  const { data: allUserAccounts } = await supabase
    .from('accounts')
    .select('currency,current_balance_cents,include_in_net_worth')
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

  // Aktiva total from EVERY user account (the unfiltered list fetched up top),
  // so the hero number stays stable while the user filters/searches the list.
  const aktivaInScopeCents = computeAktivaInScopeCents(
    (allUserAccounts ?? []) as unknown as Account[],
    baseCurrency,
  );

  // Two parallel reads, both keyed off the user but otherwise independent:
  //   - recent transactions → "Zadnja: <merchant>" preview per card (R7-light)
  //   - balance history RPC → 30-day sparkline per card (R7 full)
  // We `Promise.all` rather than awaiting sequentially so the slower of
  // the two doesn't gate the other; on a typical user this saves
  // ~50-80ms of total /racuni latency.
  //
  // The RPC isn't in the generated `Database` types until Supabase types
  // are regenerated post-migration push, so we cast at the call site
  // (same pattern as `__tests__/rls/rate-limit-rpc.test.ts`). Inline cast
  // — extracting `supabase.rpc` to a const detaches it from its receiver
  // and trips `@typescript-eslint/unbound-method`.
  const [recentTxResult, balanceHistoryResult] = await Promise.all([
    supabase
      .from('transactions')
      .select(
        'account_id,transaction_date,original_amount_cents,merchant_raw,description,is_transfer,merchants(display_name)',
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
    (
      supabase.rpc as (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>
    )('get_account_balance_history', { p_days: 30 }),
  ]);

  const lastTransactionByAccount = buildLastTransactionMap(recentTxResult.data ?? []);
  // Two-step cast (`as unknown as` instead of direct cast) because the RPC
  // hasn't been added to the generated `Database` types yet — Supabase
  // sees its return as the catch-all union of every RPC's return shape.
  const balanceHistoryByAccount = buildBalanceHistoryMap(
    (balanceHistoryResult.data ?? []) as unknown as BalanceHistoryRow[],
  );

  const groups = groupAccountsByType(accounts, baseCurrency);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Računi</h2>
        <Button asChild className="h-11 w-full shrink-0 sm:w-auto" data-testid="add-account">
          <Link href="/racuni/novi" className="inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Dodaj račun
          </Link>
        </Button>
      </div>

      {totalCount > 0 ? (
        <div className="mb-6 flex flex-col gap-1 sm:mb-8" data-testid="accounts-summary">
          <p className="text-caption text-muted-foreground">Stanje aktiva</p>
          <div className="flex items-baseline gap-3">
            <Money
              cents={aktivaInScopeCents}
              currency={baseCurrency}
              tone={aktivaInScopeCents < 0n ? 'expense' : 'default'}
              className="text-headline tabular-nums"
            />
            <span className="text-caption text-muted-foreground">
              {totalCount === 1 ? '1 račun' : `${String(totalCount)} računa`} ukupno
            </span>
          </div>
        </div>
      ) : null}

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
          lastTransactionByAccount={Object.fromEntries(lastTransactionByAccount)}
          balanceHistoryByAccount={Object.fromEntries(balanceHistoryByAccount)}
        />
      )}
    </div>
  );
}
