'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { buildUserExportJsonForRequest } from '@/lib/export/build-user-export-json';
import { createClient } from '@/lib/supabase/server';
import { UpdateProfileSchema } from './schema';

export type UpdateProfileResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { display_name?: string[]; base_currency?: string[]; locale?: string[] };
    }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type ExportAllDataResult =
  | { success: true; json: string }
  | {
      success: false;
      error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'DATABASE_ERROR';
    };

export type RestoreDefaultCategoriesResult =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' | 'DATABASE_ERROR' };

/**
 * Builds a full JSON export for the signed-in user (backup / portability).
 * Prefer downloading via GET `/api/export/data` from the browser so the response is streamable.
 */
export async function exportAllData(): Promise<ExportAllDataResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const result = await buildUserExportJsonForRequest(supabase, user.id);
  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true, json: result.json };
}

/**
 * Re-runs the idempotent default category seed for the signed-in user.
 * Existing rows (same user_id + slug) are left unchanged.
 */
export async function restoreDefaultCategories(): Promise<RestoreDefaultCategoriesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { error } = await supabase.rpc('restore_default_categories_for_user');
  if (error) {
    console.error('restore_default_categories_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/podesavanja');
  revalidatePath('/kategorije');
  revalidatePath('/transakcije');
  return { success: true };
}

export async function updateProfile(input: unknown): Promise<UpdateProfileResult> {
  const parsed = UpdateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        display_name: tree.properties?.display_name?.errors,
        base_currency: tree.properties?.base_currency?.errors,
        locale: tree.properties?.locale?.errors,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id);

  if (error) {
    console.error('update_profile_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/podesavanja');
  return { success: true };
}

/**
 * Sign out and drop the user back on the login page. The `redirect()` helper
 * throws a special `NEXT_REDIRECT` signal that Next.js handles — this is the
 * supported pattern for Server Actions, not a violation of the "never throw"
 * rule (which applies to domain errors, which still go through return values).
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/prijava');
}
