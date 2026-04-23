'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  AccountIdParamSchema,
  CreateAccountSchema,
  ReorderAccountsSchema,
  UpdateAccountSchema,
} from '@/lib/accounts/validation';
import { convertToBase } from '@/lib/fx/convert';
import type { Database } from '@/supabase/types';

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
  return new Date().toISOString().slice(0, 10);
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

  const { name, type, institution, currency, initial_balance_cents, icon, color } = parsed.data;

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
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('create_account_error', { userId: user.id, error: insertError.message });
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
      console.error('create_account_opening_cat_select', {
        userId: user.id,
        error: obCatError.message,
      });
      await supabase.from('accounts').delete().eq('id', newId);
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!obCat) {
      await supabase.from('accounts').delete().eq('id', newId);
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
      console.error('create_account_opening_fx_error', {
        userId: user.id,
        error: error instanceof Error ? error.message : 'unknown',
      });
      await supabase.from('accounts').delete().eq('id', newId);
      return { success: false, error: 'EXTERNAL_SERVICE_ERROR' };
    }

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      account_id: newId,
      original_amount_cents: centsToDbInt(initial),
      original_currency: currency,
      base_amount_cents: centsToDbInt(fxConversion.baseCents),
      base_currency: baseCurrency,
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
      console.error('create_account_opening_tx_error', { userId: user.id, error: txError.message });
      await supabase.from('accounts').delete().eq('id', newId);
      return { success: false, error: 'DATABASE_ERROR' };
    }
  }

  revalidatePath('/racuni');
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
    console.error('update_account_select', { userId: user.id, error: selErr.message });
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
    console.error('update_account_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
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
    console.error('delete_account_select', { userId: user.id, error: selErr.message });
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
    console.error('delete_account_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  revalidatePath(`/racuni/${idParse.data}`);
  return { success: true };
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
    console.error('reorder_accounts_select', { userId: user.id, error: oErr.message });
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
    console.error('reorder_accounts_error', { userId: user.id, error: failed.error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/racuni');
  return { success: true };
}
