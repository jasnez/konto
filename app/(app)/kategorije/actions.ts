'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  CategoryIdSchema,
  CategorySchema,
  ReorderCategoriesSchema,
  UpdateCategorySchema,
} from '@/lib/categories/validation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/supabase/types';

type CategoryUpdate = Database['public']['Tables']['categories']['Update'];

interface ZodErrorTree {
  errors: string[];
  properties?: Record<string, { errors?: string[] } | ZodErrorTree | undefined>;
}

function asErrorTree(t: z.core.$ZodErrorTree<z.ZodError>): ZodErrorTree {
  return t;
}

export type CategoryFieldErrorDetails = Partial<{
  name: string[];
  slug: string[];
  icon: string[];
  color: string[];
  kind: string[];
  parent_id: string[];
}>;

function buildCategoryFieldErrors(error: z.ZodError): CategoryFieldErrorDetails {
  const t = asErrorTree(z.treeifyError(error));
  return {
    name: t.properties?.name?.errors,
    slug: t.properties?.slug?.errors,
    icon: t.properties?.icon?.errors,
    color: t.properties?.color?.errors,
    kind: t.properties?.kind?.errors,
    parent_id: t.properties?.parent_id?.errors,
  };
}

function collectZodTreeMessages(t: ZodErrorTree) {
  const out: string[] = [];
  if (t.errors.length) out.push(...t.errors);
  return out;
}

function reorderGroupOk(kinds: Set<string>): boolean {
  if (kinds.size === 0) return true;
  const list = [...kinds];
  const expenseLike = new Set(['expense', 'saving', 'investment']);
  if (list.every((k) => expenseLike.has(k))) return true;
  return list.length === 1 && (list[0] === 'income' || list[0] === 'transfer');
}

export type CreateCategoryResult =
  | { success: true; data: { id: string } }
  | { success: false; error: 'VALIDATION_ERROR'; details: CategoryFieldErrorDetails }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'SLUG_CONFLICT' };

export type UpdateCategoryResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: CategoryFieldErrorDetails | { _root: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' }
  | { success: false; error: 'SLUG_CONFLICT' };

export type DeleteCategoryResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'SYSTEM_CATEGORY' }
  | { success: false; error: 'DATABASE_ERROR' };

export type RestoreCategoryResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export type ReorderCategoriesResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'NOT_FOUND' }
  | { success: false; error: 'DATABASE_ERROR' };

export async function createCategory(input: unknown): Promise<CreateCategoryResult> {
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildCategoryFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { name, slug, icon, color, kind, parent_id } = parsed.data;

  if (parent_id) {
    const { data: parent, error: pErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', parent_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (pErr) {
      console.error('create_category_parent_select', { userId: user.id, error: pErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!parent) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { parent_id: ['Kategorija roditelj nije pronađena'] },
      };
    }
  }

  const { data: maxRow, error: maxErr } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    console.error('create_category_sort_select', { userId: user.id, error: maxErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const nextOrder = (maxRow?.sort_order ?? 0) + 10;

  const { data: row, error: insErr } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name,
      slug,
      icon: icon ?? null,
      color: color ?? null,
      kind,
      parent_id: parent_id ?? null,
      is_system: false,
      sort_order: nextOrder,
    })
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      return { success: false, error: 'SLUG_CONFLICT' };
    }
    console.error('create_category_error', { userId: user.id, error: insErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/kategorije');
  return { success: true, data: { id: row.id } };
}

export async function updateCategory(id: unknown, input: unknown): Promise<UpdateCategoryResult> {
  const idParse = CategoryIdSchema.safeParse(id);
  if (!idParse.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: asErrorTree(z.treeifyError(idParse.error)).errors },
    };
  }

  const parsed = UpdateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: buildCategoryFieldErrors(parsed.error),
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
    .from('categories')
    .select('id, is_system')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    console.error('update_category_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!existing) {
    return { success: false, error: 'NOT_FOUND' };
  }

  const p = parsed.data;
  const patch: CategoryUpdate = {};

  if (p.name !== undefined) {
    const t = p.name.trim();
    if (t.length === 0) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { name: ['Naziv je obavezan'] },
      };
    }
    patch.name = t;
  }

  if (existing.is_system) {
    if (Object.hasOwn(p, 'icon')) patch.icon = p.icon ?? null;
    if (Object.hasOwn(p, 'color')) patch.color = p.color ?? null;
  } else {
    if (p.slug !== undefined) {
      const ts = p.slug.trim();
      patch.slug = ts;
    }
    if (Object.hasOwn(p, 'icon')) patch.icon = p.icon ?? null;
    if (Object.hasOwn(p, 'color')) patch.color = p.color ?? null;
    if (p.kind !== undefined) patch.kind = p.kind;
    if (Object.hasOwn(p, 'parent_id')) patch.parent_id = p.parent_id ?? null;
  }

  if (Object.keys(patch).length === 0) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: ['Nema dozvoljenih izmjena'] },
    };
  }

  if (!existing.is_system && patch.parent_id !== undefined && patch.parent_id !== null) {
    const { data: parent, error: pErr } = await supabase
      .from('categories')
      .select('id')
      .eq('id', patch.parent_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (pErr) {
      console.error('update_category_parent_select', { userId: user.id, error: pErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (!parent) {
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        details: { parent_id: ['Kategorija roditelj nije pronađena'] },
      };
    }
  }

  if (!existing.is_system && patch.slug !== undefined) {
    const { data: dup, error: dErr } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('slug', patch.slug)
      .is('deleted_at', null)
      .neq('id', idParse.data)
      .maybeSingle();
    if (dErr) {
      console.error('update_category_slug_check', { userId: user.id, error: dErr.message });
      return { success: false, error: 'DATABASE_ERROR' };
    }
    if (dup) {
      return { success: false, error: 'SLUG_CONFLICT' };
    }
  }

  const { error: upErr } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    if (upErr.code === '23505') {
      return { success: false, error: 'SLUG_CONFLICT' };
    }
    console.error('update_category_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/kategorije');
  return { success: true };
}

export async function deleteCategory(id: unknown): Promise<DeleteCategoryResult> {
  const idParse = CategoryIdSchema.safeParse(id);
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
    .from('categories')
    .select('id, is_system')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (selErr) {
    console.error('delete_category_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!row) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (row.is_system) {
    return { success: false, error: 'SYSTEM_CATEGORY' };
  }

  const { error: delErr } = await supabase
    .from('categories')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (delErr) {
    console.error('delete_category_error', { userId: user.id, error: delErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/kategorije');
  return { success: true };
}

export async function restoreCategory(id: unknown): Promise<RestoreCategoryResult> {
  const idParse = CategoryIdSchema.safeParse(id);
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
    .from('categories')
    .select('id, deleted_at')
    .eq('id', idParse.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (selErr) {
    console.error('restore_category_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (!row) {
    return { success: false, error: 'NOT_FOUND' };
  }
  if (!row.deleted_at) {
    return { success: true };
  }

  const { error: upErr } = await supabase
    .from('categories')
    .update({ deleted_at: null })
    .eq('id', idParse.data)
    .eq('user_id', user.id);

  if (upErr) {
    console.error('restore_category_error', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/kategorije');
  return { success: true };
}

export async function reorderCategories(orderedIds: unknown): Promise<ReorderCategoriesResult> {
  const parsed = ReorderCategoriesSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: collectZodTreeMessages(asErrorTree(z.treeifyError(parsed.error))) },
    };
  }

  const ids = parsed.data;
  if (ids.length === 0) {
    revalidatePath('/kategorije');
    return { success: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { data: rows, error: rErr } = await supabase
    .from('categories')
    .select('id, kind')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .in('id', ids);

  if (rErr) {
    console.error('reorder_categories_select', { userId: user.id, error: rErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }
  if (rows.length !== ids.length) {
    return { success: false, error: 'NOT_FOUND' };
  }

  if (!reorderGroupOk(new Set(rows.map((r) => r.kind)))) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        _root: [
          'Redoslijed možeš mijenjati samo unutar jedne grupe (troškovi, prihodi ili transferi).',
        ],
      },
    };
  }

  const updates = ids.map((categoryId, index) =>
    supabase
      .from('categories')
      .update({ sort_order: index * 10 })
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .is('deleted_at', null),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('reorder_categories_error', { userId: user.id, error: failed.error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/kategorije');
  return { success: true };
}
