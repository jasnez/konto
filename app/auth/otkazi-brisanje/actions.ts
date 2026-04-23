'use server';

import { redirect } from 'next/navigation';
import { runCancelDeletion } from '@/lib/account-deletion/run-cancel-deletion';

export interface CancelDeletionFailure {
  success: false;
  error: 'INVALID_TOKEN' | 'NO_EMAIL' | 'USER_NOT_FOUND' | 'NOT_SCHEDULED' | 'MAGIC_LINK_FAILED';
}

/**
 * Otkaži zakazano brisanje i generiši magic link za ponovnu prijavu.
 * GET `/auth/otkazi-brisanje?token=…` je primarni tok; ova akcija služi za programski poziv.
 */
export async function cancelDeletion(token: string) {
  const result = await runCancelDeletion(token);
  if (!result.ok) {
    return { success: false, error: result.error } satisfies CancelDeletionFailure;
  }
  redirect(result.magicLinkUrl);
}
