'use server';

import { recoverStuckImports } from '@/lib/server/actions/recover-stuck-imports';
import { createClient } from '@/lib/supabase/server';

export interface RecoverStuckImportsActionResult {
  success: boolean;
  recovered?: number;
  error?: string;
}

/**
 * Server action wrapper for `recoverStuckImports`.
 * Called by the import-list page to clean up any stuck imports.
 */
export async function handleRecoverStuckImports(): Promise<RecoverStuckImportsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const result = await recoverStuckImports(supabase, user.id);
  return {
    success: result.success,
    recovered: result.recovered,
    error: result.message,
  };
}
