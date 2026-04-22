'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
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
