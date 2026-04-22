'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { mustExist } from '@/lib/env';
import { SigninSchema } from './schema';

export type SendMagicLinkResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { email?: string[] } }
  | { success: false; error: 'EMAIL_SEND_FAILED' };

export async function sendMagicLink(input: unknown): Promise<SendMagicLinkResult> {
  const parsed = SigninSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    const emailErrors = tree.properties?.email?.errors;
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: emailErrors && emailErrors.length > 0 ? { email: emailErrors } : {},
    };
  }

  const siteUrl = mustExist('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    // Do not log the email — PII redaction rule in .cursor/rules/security.mdc.
    console.error('signin_error', { error: error.message });
    return { success: false, error: 'EMAIL_SEND_FAILED' };
  }

  return { success: true };
}
