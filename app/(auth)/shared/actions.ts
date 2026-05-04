'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { mustExist } from '@/lib/env';
import { invitesEnabled } from '@/lib/auth/invite-config';
import { SendOtpSchema, VerifyOtpSchema } from './schema';
import { logSafe } from '@/lib/logger';

export type SendOtpResult =
  | { success: true; isNewUser: boolean }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { email?: string[]; inviteCode?: string[] };
    }
  | { success: false; error: 'INVITE_REQUIRED' }
  | { success: false; error: 'INVITE_INVALID' }
  | { success: false; error: 'INVITE_USED' }
  | { success: false; error: 'INVITE_EXPIRED' }
  | { success: false; error: 'EMAIL_SEND_FAILED' };

/**
 * Sends an OTP email. When `ENABLE_INVITES=true` and the email is for a
 * NEW user (i.e., not yet in `auth.users`), an invite code is required.
 *
 * Existing users (already invited and signed up) bypass the gate — their
 * subsequent sign-ins do not need a fresh code. We detect "existing" via
 * a service-role lookup before invoking signInWithOtp.
 *
 * Code preview is server-side via the `preview_invite_code` RPC. If the
 * preview returns a non-`valid` status, we short-circuit before burning
 * a Supabase OTP email. The authoritative consume happens in the
 * `handle_new_user` trigger inside the OTP-verify transaction (race-safe).
 */
export async function sendOtp(input: unknown): Promise<SendOtpResult> {
  const parsed = SendOtpSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: {
        email: tree.properties?.email?.errors,
        inviteCode: tree.properties?.inviteCode?.errors,
      },
    };
  }

  const supabase = await createClient();
  const { email, inviteCode } = parsed.data;

  // ── Invite gating (only when env flag set) ────────────────────────────────
  // Order matters: determine new-vs-existing FIRST so we don't waste an RPC
  // round-trip checking a code that an existing user supplied (we ignore it
  // for them anyway). The trigger gate is still authoritative — this layer
  // is for nice UX and to short-circuit before burning a Supabase OTP email.
  let isNewUser = false;
  if (invitesEnabled()) {
    isNewUser = await isNewSignup(email);

    if (isNewUser) {
      if (inviteCode === undefined || inviteCode.length === 0) {
        return { success: false, error: 'INVITE_REQUIRED' };
      }

      const { data: previewStatus, error: previewErr } = await supabase
        .rpc('preview_invite_code', { p_code: inviteCode })
        .single<string>();

      if (previewErr) {
        logSafe('send_otp_invite_preview_error', { error: previewErr.message });
        // Treat unknown preview status as invalid — better to reject than to
        // burn an OTP email on a code we can't validate.
        return { success: false, error: 'INVITE_INVALID' };
      }

      if (previewStatus === 'used') return { success: false, error: 'INVITE_USED' };
      if (previewStatus === 'expired') return { success: false, error: 'INVITE_EXPIRED' };
      if (previewStatus !== 'valid') return { success: false, error: 'INVITE_INVALID' };
    }
  }

  const siteUrl = mustExist('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);

  // The custom magic-link template at supabase/templates/magic_link.html
  // emits both {{ .ConfirmationURL }} and {{ .Token }}, so users can click
  // the link (PKCE through /auth/callback) OR paste the 6-digit code into
  // verifyOtp — whichever is less fragile on their device. Mobile mail
  // clients and corporate antivirus frequently prefetch links, consuming
  // the magic-link code before the user reads the email, so the typed
  // code is the reliable path. The default Supabase template does NOT
  // include {{ .Token }} — must be customised via auth.email.template.
  // magic_link in supabase/config.toml.
  //
  // When invites are enabled, we attach the code in `data` so it surfaces in
  // the new user's `raw_user_meta_data` for the handle_new_user trigger to
  // consume atomically. For sign-ins of existing users, the `data` is
  // ignored by Supabase (no auth.users INSERT happens).
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data:
        inviteCode !== undefined && inviteCode.length > 0 ? { invite_code: inviteCode } : undefined,
    },
  });

  if (error) {
    // Do not log the email — PII redaction rule in .cursor/rules/security.mdc.
    logSafe('send_otp_error', { error: error.message });
    return { success: false, error: 'EMAIL_SEND_FAILED' };
  }

  return { success: true, isNewUser };
}

/**
 * Returns true if `email` is NOT in `auth.users` (i.e., signup, not sign-in).
 * Uses a service-role RPC because the auth schema is not user-readable.
 *
 * False on any error — we'd rather treat as "existing user" (lenient gate)
 * than block legitimate sign-ins. The trigger still enforces invite
 * consumption on actual NEW users.
 */
async function isNewSignup(email: string): Promise<boolean> {
  // We don't have a public RPC for this; call the auth admin SDK via the
  // service-role client. Done at server-action layer to keep the admin
  // client out of client bundles.
  //
  // Pagination: `listUsers` returns one page at a time. We sweep pages
  // (perPage 200) until we find a match or run out. For closed beta (≤200
  // users), one page suffices. Switch to a SECURITY DEFINER `email_exists`
  // RPC if user count grows past a few thousand — list iteration over a
  // service-role client gets expensive at scale.
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const lower = email.toLowerCase();
    const PER_PAGE = 200;
    const MAX_PAGES = 50; // hard cap → 10,000 users; well past beta horizon
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: PER_PAGE,
      });
      if (error) {
        logSafe('is_new_signup_error', { error: error.message, page });
        return false;
      }
      if (data.users.some((u) => u.email?.toLowerCase() === lower)) {
        return false; // existing user found
      }
      if (data.users.length < PER_PAGE) {
        // Last page reached without a match.
        return true;
      }
    }
    // Safety: if we somehow exceed MAX_PAGES, fail closed (treat as existing
    // user). The trigger gate is still authoritative.
    logSafe('is_new_signup_paged_out', { maxPages: MAX_PAGES });
    return false;
  } catch (err) {
    logSafe('is_new_signup_throw', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export type VerifyOtpResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { email?: string[]; token?: string[] };
    }
  | { success: false; error: 'INVALID_OR_EXPIRED' }
  | { success: false; error: 'INVITE_REJECTED' };

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
    logSafe('verify_otp_error', { error: error.message });
    // The handle_new_user trigger raises 'INVALID_OR_EXPIRED_INVITE_CODE'
    // when a fresh user's invite code is no longer valid (race against
    // another redemption, or expired between OTP send + verify). Surface
    // the specific case so the UI can render a helpful message instead
    // of the generic "code didn't work".
    if (error.message.includes('INVALID_OR_EXPIRED_INVITE_CODE')) {
      return { success: false, error: 'INVITE_REJECTED' };
    }
    return { success: false, error: 'INVALID_OR_EXPIRED' };
  }

  // verifyOtp sets the session cookies via the SSR client; redirect() throws
  // the Next.js NEXT_REDIRECT signal that surfaces to the client without a
  // return value. Declared as `never` on the happy path.
  redirect('/pocetna');
}
