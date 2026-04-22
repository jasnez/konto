'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { mustExist } from '@/lib/env';
import { SendOtpSchema, VerifyOtpSchema } from './schema';

export type SendOtpResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { email?: string[] } }
  | { success: false; error: 'EMAIL_SEND_FAILED' };

export async function sendOtp(input: unknown): Promise<SendOtpResult> {
  const parsed = SendOtpSchema.safeParse(input);
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
  // Supabase's default "Magic Link" email template includes both the link and
  // a 6-digit `{{ .Token }}`. Users can click the link (goes through
  // /auth/callback with PKCE) OR paste the code into verifyOtp — whichever
  // is less fragile on their device. Mobile email apps and corporate
  // antivirus frequently prefetch links, which consumes the magic-link code
  // before the user clicks it, so the typed code is the reliable path.
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    // Do not log the email — PII redaction rule in .cursor/rules/security.mdc.
    console.error('send_otp_error', { error: error.message });
    return { success: false, error: 'EMAIL_SEND_FAILED' };
  }

  return { success: true };
}

export type VerifyOtpResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { email?: string[]; token?: string[] };
    }
  | { success: false; error: 'INVALID_OR_EXPIRED' };

export async function verifyOtp(input: unknown): Promise<VerifyOtpResult> {
  const parsed = VerifyOtpSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        email: tree.properties?.email?.errors,
        token: tree.properties?.token?.errors,
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  });

  if (error) {
    console.error('verify_otp_error', { error: error.message });
    return { success: false, error: 'INVALID_OR_EXPIRED' };
  }

  // verifyOtp sets the session cookies via the SSR client; redirect() throws
  // the Next.js NEXT_REDIRECT signal that surfaces to the client without a
  // return value. Declared as `never` on the happy path.
  redirect('/pocetna');
}
