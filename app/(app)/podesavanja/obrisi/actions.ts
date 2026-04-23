'use server';

import { timingSafeEqual } from 'crypto';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signAccountDeletionCancelToken } from '@/lib/account-deletion/cancel-token';
import { sendAccountDeletionEmail } from '@/lib/account-deletion/send-deletion-email';
import { mustExist } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { RequestAccountDeletionSchema } from './schema';

export type RequestAccountDeletionResult =
  | { success: false; error: 'VALIDATION_ERROR'; details?: Record<string, string[] | undefined> }
  | {
      success: false;
      error:
        | 'UNAUTHORIZED'
        | 'EMAIL_MISMATCH'
        | 'ALREADY_PENDING'
        | 'EMAIL_SEND_FAILED'
        | 'EMAIL_NOT_CONFIGURED'
        | 'DATABASE_ERROR';
    };

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function requestAccountDeletion(input: unknown): Promise<RequestAccountDeletionResult> {
  const parsed = RequestAccountDeletionSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        email: tree.properties?.email?.errors,
        understood: tree.properties?.understood?.errors,
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const normalizedInput = Buffer.from(normalizeEmail(parsed.data.email), 'utf8');
  const normalizedUser = Buffer.from(normalizeEmail(user.email), 'utf8');
  if (
    normalizedInput.length !== normalizedUser.length ||
    !timingSafeEqual(normalizedInput, normalizedUser)
  ) {
    return { success: false, error: 'EMAIL_MISMATCH' };
  }

  const { data: profile, error: profileLoadError } = await supabase
    .from('profiles')
    .select('deleted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profileLoadError) {
    console.error('request_account_deletion_profile_load_error', {
      userId: user.id,
      error: profileLoadError.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  if (profile?.deleted_at) {
    return { success: false, error: 'ALREADY_PENDING' };
  }

  const deletedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ deleted_at: deletedAt })
    .eq('id', user.id);

  if (updateError) {
    console.error('request_account_deletion_update_error', { userId: user.id, error: updateError.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const admin = createAdminClient();
  const { error: auditError } = await admin.from('audit_log').insert({
    user_id: user.id,
    event_type: 'account_deletion_requested',
    event_data: {},
  });

  if (auditError) {
    console.error('request_account_deletion_audit_error', { userId: user.id, error: auditError.message });
    await supabase.from('profiles').update({ deleted_at: null }).eq('id', user.id);
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const cancelToken = signAccountDeletionCancelToken(user.id, exp);
  const siteUrl = mustExist('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
  const cancelUrl = `${siteUrl}/auth/otkazi-brisanje?token=${encodeURIComponent(cancelToken)}`;

  const emailResult = await sendAccountDeletionEmail(user.email, cancelUrl);
  if (!emailResult.ok) {
    await supabase.from('profiles').update({ deleted_at: null }).eq('id', user.id);
    return {
      success: false,
      error: emailResult.error === 'NOT_CONFIGURED' ? 'EMAIL_NOT_CONFIGURED' : 'EMAIL_SEND_FAILED',
    };
  }

  await supabase.auth.signOut();
  redirect('/obrisan');
}
