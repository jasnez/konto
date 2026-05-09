'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  AccountIdParamSchema,
  BulkDeleteAccountIdsSchema,
  CreateAccountSchema,
  ReorderAccountsSchema,
  UpdateAccountSchema,
} from '@/lib/accounts/validation';
import { computeAccountLedgerCents } from '@/lib/fx/account-ledger';
import { convertToBase } from '@/lib/fx/convert';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

type AccountUpdate = Database['public']['Tables']['accounts']['Update'];

/** Narrow shape from `z.treeifyError` for form field / array item messages */
interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
  items?: (ZodErrorTree | { errors?: string[] } | null | undefined)[];
}

function asErrorTree(t: z.core.$ZodErrorTree<z.ZodError>): ZodErrorTree {
  return t;
}

function buildCreateAccountErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    name: t.properties?.name?.errors,
    type: t.properties?.type?.errors,
    institution: t.properties?.institution?.errors,
    currency: t.properties?.currency?.errors,
    initial_balance_cents: t.properties?.initial_balance_cents?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
    include_in_net_worth: t.properties?.include_in_net_worth?.errors,
  };
}

function buildUpdateAccountErrorDetails(error: z.ZodError) {
  const t = asErrorTree(z.treeifyError(error));
  return {
    name: t.properties?.name?.errors,
    type: t.properties?.type?.errors,
    institution: t.properties?.institution?.errors,
    currency: t.properties?.currency?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
    is_active: t.properties?.is_active?.errors,
    include_in_net_worth: t.properties?.include_in_net_worth?.errors,
    sort_order: t.properties?.sort_order?.errors,
    _root: t.errors,
  };
}

function collectZodTreeMessages(t: ZodErrorTree) {
  const out: string[] = [];
  if (t.errors.length) {
    out.push(...t.errors);
  }
  if (t.items) {
    for (const it of t.items) {
      if (it && typeof it === 'object' && 'errors' in it && it.errors?.length) {
        out.push(...it.errors);
      }
    }
  }
  return out;
}

export type CreateAccountResult =
  | { success: true; data: { id: string } }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildCreateAccountErrorDetails>;
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'OPENING_BALANCE_CATEGORY_MISSING' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' };

export type UpdateAccountResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: ReturnType<typeof buildUpdateAccountErrorDetails> | { _root: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type DeleteAccountResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type BulkDeleteAccountsResult =
  | { success: true; data: { accountsCount: number; transactionsCount: number } }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  // SE-14: ownership-fail (any ID in the bulk not owned) returns NOT_FOUND.
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type ReorderAccountsResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

function centsToDbInt(c: bigint): number {
  if (c < BigInt(Number.MIN_SAFE_INTEGER) || c > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(c);
  }
  return Number(c);
}

function todayIsoDate(): string {
  // Local-date format; toISOString would shift to UTC and return prior day for
  // users in negative-offset timezones around midnight.
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const ReconcileCashAccountSchema = z.object({
  account_id: z.uuid(),
  actual_balance_cents: z.bigint(),
});

export type ReconcileCashAccountResult =
  | { success: true; data: { transactionId: string; deltaCents: string } }
  | { success: true; data: { transactionId: null; deltaCents: '0' } }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'NOT_CASH_ACCOUNT' }
  | { success: false; error: 'CATEGORY_MISSING' }
  | { success: false; error: 'EXTERNAL_SERVICE_ERROR' }
  | { success: false; error: 'DATABASE_ERROR' };

/**
 * @public
 * Reconcile a cash account against the actual amount the user has on hand.
 *
 * Computes delta = actual - currentLedger. Posts a single transaction in the
 * "Gotovinski troškovi" system category to absorb the gap (expense if cash
 * was lost / spent untracked, income if found). When delta is zero we return
 * a no-op success so the dialog can close cleanly.
 */
export async function reconcileCashAccount(input: unknown): Promise<ReconcileCashAccountResult> {
  const parsed = ReconcileCashAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: parsed.error.issues.map((issue) => issue.message) },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: account, error: aErr } = await supabase
    .from('accounts')
    .select('id, type, currency, current_balance_cents')
    .eq('id', parsed.data.account_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (aErr) {
    logSafe('reconcile_cash_account_select', { userId: user.id, error: aErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!account) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (account.type !== 'cash') {
    return { success: false, error: 'NOT_CASH_ACCOUNT' };
  }

  const currentCents = BigInt(account.current_balance_cents);
  const deltaCents = parsed.data.actual_balance_cents - currentCents;

  if (deltaCents === 0n) {
    return { success: true, data: { transactionId: null, deltaCents: '0' } };
  }

  const { data: cat, error: cErr } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', 'gotovinski-troskovi')
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr) {
    logSafe('reconcile_cash_account_cat', { userId: user.id, error: cErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!cat) {
    return { success: false, error: 'CATEGORY_MISSING' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  const baseCurrency = profile?.base_currency ?? 'BAM';
  const txDate = todayIsoDate();

  let fxConversion: Awaited<ReturnType<typeof convertToBase>>;
  try {
    fxConversion = await convertToBase(deltaCents, account.currency, baseCurrency, txDate);
  } catch (error) {
    logSafe('reconcile_cash_account_fx', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  let ledgerCents: bigint;
  try {
    ledgerCents = await computeAccountLedgerCents(
      account.currency,
      deltaCents,
      account.currency,
      fxConversion.baseCents,
      baseCurrency,
      txDate,
    );
  } catch (error) {
    logSafe('reconcile_cash_account_ledger', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
  }

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: account.id,
      original_amount_cents: centsToDbInt(deltaCents),
      original_currency: account.currency,
      base_amount_cents: centsToDbInt(fxConversion.baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: centsToDbInt(ledgerCents),
      fx_rate: fxConversion.fxRate,
      fx_rate_date: fxConversion.fxRateDate,
      fx_stale: fxConversion.fxStale,
      transaction_date: txDate,
      source: 'manual',
      category_id: cat.id,
      category_source: 'user',
      notes: `Usklađivanje gotovine ${txDate}`,
    })
    .select('id')
    .single();

  if (txErr) {
    logSafe('reconcile_cash_account_tx', { userId: user.id, error: txErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath('/pocetna');
  revalidatePath(`/racuni/${account.id}`);

  return {
    success: true,
    data: { transactionId: tx.id, deltaCents: deltaCents.toString() },
  };
}

/**
 * @public helper for createAccount flow + tests
 */
export async function createAccount(input: unknown): Promise<CreateAccountResult> {
  const parsed = CreateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildCreateAccountErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const {
    name,
    type,
    institution,
    currency,
    initial_balance_cents,
    icon,
    color,
    include_in_net_worth,
  } = parsed.data;

  const { data: lastAccount } = await supabase
    .from('accounts')
    .select('sort_order')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastAccount?.sort_order ?? -1) + 1;
  const initial = initial_balance_cents;
  const current = initial;

  const { data: newRow, error: insertError } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      name,
      type,
      institution: institution ?? null,
      currency,
      initial_balance_cents: centsToDbInt(initial),
      current_balance_cents: centsToDbInt(current),
      icon: icon ?? null,
      color: color ?? null,
      include_in_net_worth,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (insertError) {
    logSafe('create_account_error', { userId: user.id, error: insertError.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const newId = newRow.id;

  if (initial !== BigInt(0)) {
    const { data: obCat, error: obCatError } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('slug', 'opening_balance')
      .is('deleted_at', null)
      .maybeSingle();

    if (obCatError) {
      logSafe('create_account_opening_cat_select', {
        userId: user.id,
        error: obCatError.message,
      });
      await supabase.from('accounts').delete().eq('id', newId).eq('user_id', user.id);
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!obCat) {
      await supabase.from('accounts').delete().eq('id', newId).eq('user_id', user.id);
      return { success: false, error: 'OPENING_BALANCE_CATEGORY_MISSING' };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('base_currency')
      .eq('id', user.id)
      .maybeSingle();
    const baseCurrency = profile?.base_currency ?? 'BAM';
    const txDate = todayIsoDate();
    let fxConversion: Awaited<ReturnType<typeof convertToBase>>;
    try {
      fxConversion = await convertToBase(initial, currency, baseCurrency, txDate);
    } catch (error) {
      logSafe('create_account_opening_fx_error', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      await supabase.from('accounts').delete().eq('id', newId).eq('user_id', user.id);
      return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
    }

    let openingLedger: bigint;
    try {
      openingLedger = await computeAccountLedgerCents(
        currency,
        initial,
        currency,
        fxConversion.baseCents,
        baseCurrency,
        txDate,
      );
    } catch (error) {
      logSafe('create_account_opening_ledger_error', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      await supabase.from('accounts').delete().eq('id', newId).eq('user_id', user.id);
      return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
    }

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: newId,
      original_amount_cents: centsToDbInt(initial),
      original_currency: currency,
      base_amount_cents: centsToDbInt(fxConversion.baseCents),
      base_currency: baseCurrency,
      account_ledger_cents: centsToDbInt(openingLedger),
      fx_rate: fxConversion.fxRate,
      fx_rate_date: fxConversion.fxRateDate,
      fx_stale: fxConversion.fxStale,
      transaction_date: txDate,
      source: 'manual',
      category_id: obCat.id,
      category_source: 'user',
      description: 'Početno stanje',
    });

    if (txError) {
      logSafe('create_account_opening_tx_error', { userId: user.id, error: txError.message });
      await supabase.from('accounts').delete().eq('id', newId).eq('user_id', user.id);
      return { success: false, error: 'DATABASE_ERROR' };
    }
  }

  revalidatePath('/racuni');
  revalidatePath('/pocetna');
  revalidatePath(`/racuni/${newId}`);
  return { success: true, data: { id: newId } };
}

/**
 * @public
 */
export async function updateAccount(id: unknown, input: unknown): Promise<UpdateAccountResult> {
  const idParse = AccountIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }
  const parsed = UpdateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildUpdateAccountErrorDetails(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: row, error: selErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    logSafe('update_account_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!row) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;
  const patch: AccountUpdate = {};
  if (p.name !== undefined) patch.name = p.name;
  if (p.type !== undefined) patch.type = p.type;
  if (p.institution !== undefined) patch.institution = p.institution;
  if (p.currency !== undefined) patch.currency = p.currency;
  if (p.icon !== undefined) patch.icon = p.icon;
  if (Object.hasOwn(p, 'color')) patch.color = p.color;
  if (p.is_active !== undefined) patch.is_active = p.is_active;
  if (p.include_in_net_worth !== undefined) patch.include_in_net_worth = p.include_in_net_worth;
  if (p.sort_order !== undefined) patch.sort_order = p.sort_order;

  const { error: upErr } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    logSafe('update_account_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath('/pocetna');
  revalidatePath(`/racuni/${idParse.data}`);
  revalidatePath(`/racuni/${idParse.data}/uredi`);
  return { success: true };
}

/**
 * @public
 */
export async function deleteAccount(id: unknown): Promise<DeleteAccountResult> {
  const idParse = AccountIdParamSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: row, error: selErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    logSafe('delete_account_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!row) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const { error: delErr } = await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('delete_account_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath(`/racuni/${idParse.data}`);
  return { success: true };
}

/**
 * @public
 * Soft-delete više računa odjednom, plus sve njihove ne-obrisane transakcije.
 * Razlika u odnosu na single `deleteAccount`: bulk varijanta također
 * soft-deletuje pripadajuće transakcije (svjesna odluka korisnika).
 */
export async function bulkDeleteAccounts(ids: unknown): Promise<BulkDeleteAccountsResult> {
  const parsed = BulkDeleteAccountIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(parsed.error)).errors },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const accountIds = parsed.data;

  const { data: ownedRows, error: ownedErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id)
    .in('id', accountIds)
    .is('deleted_at', null);

  if (ownedErr) {
    logSafe('bulk_delete_accounts_select', { userId: user.id, error: ownedErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (ownedRows.length !== accountIds.length) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const deletedAt = new Date().toISOString();

  const { error: delAccErr, count: accountsCount } = await supabase
    .from('accounts')
    .update({ deleted_at: deletedAt }, { count: 'exact' })
    .eq('user_id', user.id)
    .in('id', accountIds)
    .is('deleted_at', null);

  if (delAccErr) {
    logSafe('bulk_delete_accounts_update', { userId: user.id, error: delAccErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const { error: delTxErr, count: transactionsCount } = await supabase
    .from('transactions')
    .update({ deleted_at: deletedAt }, { count: 'exact' })
    .eq('user_id', user.id)
    .in('account_id', accountIds)
    .is('deleted_at', null);

  if (delTxErr) {
    logSafe('bulk_delete_accounts_tx_update', { userId: user.id, error: delTxErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath('/pocetna');
  revalidatePath('/transakcije');
  for (const id of accountIds) {
    revalidatePath(`/racuni/${id}`);
  }

  return {
    success: true,
    data: {
      accountsCount: accountsCount ?? accountIds.length,
      transactionsCount: transactionsCount ?? 0,
    },
  };
}

export type CreateCashAccountResult =
  | { success: true; data: { id: string } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'ALREADY_EXISTS'; data: { id: string } }
  | { success: false; error: 'DATABASE_ERROR' };

/**
 * @public
 * Quick-create a "Gotovina" cash account for the signed-in user.
 *
 * Used by the ATM-withdrawal preset in Quick Add (and the import-review
 * "Transfer u Gotovinu" suggestion) when the user has no cash account yet.
 * Returns ALREADY_EXISTS with the existing id if one is already present so
 * the caller can chain into the transfer flow without surfacing an error.
 */
export async function createCashAccount(name?: unknown): Promise<CreateCashAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: existing, error: existingErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id)
    .eq('type', 'cash')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    logSafe('create_cash_account_existing_select', { userId: user.id, error: existingErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (existing) {
    return { success: false, error: 'ALREADY_EXISTS', data: { id: existing.id } };
  }

  const trimmed = typeof name === 'string' ? name.trim() : '';
  const accountName = trimmed.length > 0 ? trimmed.slice(0, 100) : 'Gotovina';

  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .maybeSingle();
  const currency = profile?.base_currency ?? 'BAM';

  const { data: lastAccount } = await supabase
    .from('accounts')
    .select('sort_order')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastAccount?.sort_order ?? -1) + 1;

  const { data: newRow, error: insertError } = await supabase
    .from('accounts')
    .insert({
      user_id: user.id,
      name: accountName,
      type: 'cash',
      institution: null,
      currency,
      initial_balance_cents: 0,
      current_balance_cents: 0,
      icon: '💵',
      color: null,
      include_in_net_worth: true,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (insertError) {
    logSafe('create_cash_account_insert', { userId: user.id, error: insertError.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath('/pocetna');
  return { success: true, data: { id: newRow.id } };
}

/**
 * @public
 */
export async function reorderAccounts(orderedIds: unknown): Promise<ReorderAccountsResult> {
  const parsed = ReorderAccountsSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: collectZodTreeMessages(asErrorTree(z.treeifyError(parsed.error))) },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const ids = parsed.data;
  if (ids.length === 0) {
    revalidatePath('/racuni');
    return { success: true };
  }

  const { data: ownRows, error: oErr } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', ids);

  if (oErr) {
    logSafe('reorder_accounts_select', { userId: user.id, error: oErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (ownRows.length !== ids.length) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const updates = ids.map((accountId, index) =>
    supabase
      .from('accounts')
      .update({ sort_order: index })
      .eq('id', accountId)
      .eq('user_id', user.id)
      .is('deleted_at', null),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    logSafe('reorder_accounts_error', { userId: user.id, error: failed.error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  return { success: true };
}
