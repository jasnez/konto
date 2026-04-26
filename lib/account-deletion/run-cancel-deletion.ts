import { verifyAccountDeletionCancelToken } from '@/lib/account-deletion/cancel-token';
import { mustExist } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSafe } from '@/lib/logger';

export type RunCancelDeletionResult =
  | { ok: true; magicLinkUrl: string }
  | {
      ok: false;
      error:
        | 'INVALID_TOKEN'
        | 'NO_EMAIL'
        | 'USER_NOT_FOUND'
        | 'NOT_SCHEDULED'
        | 'MAGIC_LINK_FAILED';
    };

/**
 * Clears soft-delete flag and returns a one-time Supabase magic-link URL so the user can sign in again.
 */
export async function runCancelDeletion(token: string): Promise<RunCancelDeletionResult> {
  const verified = verifyAccountDeletionCancelToken(token);
  if (!verified.ok) {
    return { ok: false, error: 'INVALID_TOKEN' };
  }

  const admin = createAdminClient();
  const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(
    verified.userId,
  );
  if (getUserError) {
    logSafe('cancel_deletion_get_user_error', { error: getUserError.message });
    return { ok: false, error: 'USER_NOT_FOUND' };
  }

  const email = userData.user.email;
  if (!email) {
    return { ok: false, error: 'NO_EMAIL' };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('deleted_at')
    .eq('id', verified.userId)
    .maybeSingle();

  if (profileError) {
    logSafe('cancel_deletion_profile_error', { error: profileError.message });
    return { ok: false, error: 'USER_NOT_FOUND' };
  }

  if (!profile?.deleted_at) {
    return { ok: false, error: 'NOT_SCHEDULED' };
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ deleted_at: null })
    .eq('id', verified.userId);

  if (updateError) {
    logSafe('cancel_deletion_update_error', { error: updateError.message });
    return { ok: false, error: 'USER_NOT_FOUND' };
  }

  const siteUrl = mustExist('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
  const nextPath = '/pocetna?deletionCanceled=1';
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (linkError) {
    logSafe('cancel_deletion_magic_link_error', { error: linkError.message });
    return { ok: false, error: 'MAGIC_LINK_FAILED' };
  }

  return { ok: true, magicLinkUrl: linkData.properties.action_link };
}
