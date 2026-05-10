'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CreateMerchantSchema,
  MerchantIdSchema,
  SearchMerchantsParamsSchema,
  UpdateMerchantSchema,
} from '@/lib/merchants/validation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';
import { logSafe } from '@/lib/logger';

type MerchantUpdate = Database['public']['Tables']['merchants']['Update'];

interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
}

function asErrorTree(t: z.core.$ZodErrorTree<z.ZodError>): ZodErrorTree {
  return t;
}

export type MerchantFieldErrorDetails = Partial<{
  canonical_name: string[];
  display_name: string[];
  default_category_id: string[];
  icon: string[];
  color: string[];
}>;

function buildMerchantFieldErrors(error: z.ZodError): MerchantFieldErrorDetails {
  const t = asErrorTree(z.treeifyError(error));
  return {
    canonical_name: t.properties?.canonical_name?.errors,
    display_name: t.properties?.display_name?.errors,
    default_category_id: t.properties?.default_category_id?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
  };
}

export interface MerchantResult {
  id: string;
  canonical_name: string;
  display_name: string;
  default_category_id: string | null;
  icon: string | null;
  color: string | null;
  transaction_count: number;
  similarity_score: number;
}

export type CreateMerchantResult =
  | { success: true; data: { id: string } }
  | { success: false; error: 'VALIDATION_ERROR'; details: MerchantFieldErrorDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'DUPLICATE_CANONICAL'; existingId: string }
  | { success: false; error: 'DUPLICATE_CANONICAL_NOT_FOUND' };

export type UpdateMerchantResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: MerchantFieldErrorDetails | { _root: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'DUPLICATE_CANONICAL' };

export type DeleteMerchantResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'MERCHANT_HAS_TRANSACTIONS' }
  | { success: false; error: 'DATABASE_ERROR' };

export type BulkDeleteEmptyMerchantsResult =
  | { success: true; data: { count: number } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type SearchMerchantsResult =
  | { success: true; data: MerchantResult[] }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

interface SearchMerchantsRpcRow {
  id: string;
  canonical_name: string;
  display_name: string;
  default_category_id: string | null;
  icon: string | null;
  color: string | null;
  transaction_count: number;
  similarity_score: number;
}

function mapRpcRow(r: SearchMerchantsRpcRow): MerchantResult {
  return {
    id: r.id,
    canonical_name: r.canonical_name,
    display_name: r.display_name,
    default_category_id: r.default_category_id,
    icon: r.icon,
    color: r.color,
    transaction_count: r.transaction_count,
    similarity_score: r.similarity_score,
  };
}

export async function searchMerchants(
  query: unknown,
  limit: unknown = 10,
): Promise<SearchMerchantsResult> {
  const parsed = SearchMerchantsParamsSchema.safeParse({ query, limit });
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: parsed.error.issues.map((i) => i.message) },
    };
  }

  const q = parsed.data.query.trim();
  if (q.length === 0) {
    return { success: true, data: [] };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data, error } = await supabase.rpc('search_merchants', {
    p_query: q,
    p_limit: parsed.data.limit,
  });

  if (error) {
    logSafe('search_merchants_rpc', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const rows = data as SearchMerchantsRpcRow[];
  return { success: true, data: rows.map(mapRpcRow) };
}

export async function createMerchant(input: unknown): Promise<CreateMerchantResult> {
  const parsed = CreateMerchantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildMerchantFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { canonical_name, display_name, default_category_id, icon, color } = parsed.data;

  if (default_category_id) {
    const { data: cat, error: cErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', default_category_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) {
      logSafe('create_merchant_category', { userId: user.id, error: cErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!cat) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { default_category_id: ['Kategorija nije pronađena'] },
      };
    }
  }

  const { data: row, error: insErr } = await supabase
    .from('merchants')
    .insert({
      user_id: user.id,
      canonical_name,
      display_name,
      default_category_id: default_category_id ?? null,
      icon: icon ?? null,
      color: color ?? null,
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: existing } = await supabase
        .from('merchants')
        .select('id')
        .eq('user_id', user.id)
        .eq('canonical_name', canonical_name)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing) {
        return { success: false, error: 'DUPLICATE_CANONICAL', existingId: existing.id };
      }
      logSafe('create_merchant_duplicate_not_found', { userId: user.id, canonical_name });
      return { success: false, error: 'DUPLICATE_CANONICAL_NOT_FOUND' };
    }
    logSafe('create_merchant_error', { userId: user.id, error: insErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/prodavaci');
  return { success: true, data: { id: row.id } };
}

export async function updateMerchant(id: unknown, input: unknown): Promise<UpdateMerchantResult> {
  const idParse = MerchantIdSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }

  const parsed = UpdateMerchantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildMerchantFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: existing, error: selErr } = await supabase
    .from('merchants')
    .select('id')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    logSafe('update_merchant_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;
  const patch: MerchantUpdate = {};
  if (p.canonical_name !== undefined) patch.canonical_name = p.canonical_name;
  if (p.display_name !== undefined) patch.display_name = p.display_name;
  if (Object.hasOwn(p, 'default_category_id'))
    patch.default_category_id = p.default_category_id ?? null;
  if (Object.hasOwn(p, 'icon')) patch.icon = p.icon ?? null;
  if (Object.hasOwn(p, 'color')) patch.color = p.color ?? null;

  if (Object.keys(patch).length === 0) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: ['Nema izmjena'] },
    };
  }

  if (patch.default_category_id !== undefined && patch.default_category_id !== null) {
    const { data: cat, error: cErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', patch.default_category_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (cErr) {
      logSafe('update_merchant_category', { userId: user.id, error: cErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!cat) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { default_category_id: ['Kategorija nije pronađena'] },
      };
    }
  }

  const { error: upErr } = await supabase
    .from('merchants')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    if (upErr.code === '23505') {
      return { success: false, error: 'DUPLICATE_CANONICAL' };
    }
    logSafe('update_merchant_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/prodavaci');
  return { success: true };
}

export async function deleteMerchant(id: unknown): Promise<DeleteMerchantResult> {
  const idParse = MerchantIdSchema.safeParse(id);
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
    .from('merchants')
    .select('id, transaction_count')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    logSafe('delete_merchant_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!row) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (row.transaction_count !== 0) {
    return { success: false, error: 'MERCHANT_HAS_TRANSACTIONS' };
  }

  const { error: delErr } = await supabase
    .from('merchants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (delErr) {
    logSafe('delete_merchant_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/prodavaci');
  return { success: true };
}

/**
 * Bulk soft-deletes every merchant of the current user that has zero
 * linked transactions. Audit N4 — legacy stub merchants from the days
 * when typing "Kon" in autocomplete persisted a separate row before
 * the user had picked "Konzum"; the on-type-create code path is now
 * gone (see `components/quick-add-transaction.tsx` MerchantCombobox
 * comment) so this is mostly cleanup for accounts that predate the
 * fix.
 *
 * Eligibility is decided by the `transaction_count` column on
 * `merchants`, which is maintained by triggers as transactions are
 * inserted/deleted/edited. Filtering server-side (`.eq` on
 * transaction_count) instead of client-derived ids closes a TOCTOU
 * window where a transaction could land on the merchant between the
 * page render and the click.
 */
export async function bulkDeleteEmptyMerchants(): Promise<BulkDeleteEmptyMerchantsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data, error } = await supabase
    .from('merchants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('transaction_count', 0)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    logSafe('bulk_delete_empty_merchants_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/prodavaci');
  return { success: true, data: { count: data.length } };
}
