'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { mustExist } from '@/lib/env';
import { invitesEnabled } from '@/lib/auth/invite-config';
import {
  PreviewInviteSchema,
  SendSigninOtpSchema,
  SendSignupOtpSchema,
  VerifyOtpSchema,
} from './schema';
import { logSafe } from '@/lib/logger';

// ── previewInvite ────────────────────────────────────────────────────────────

export type PreviewInviteResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { inviteCode?: string[] };
    }
  | { success: false; error: 'INVITE_INVALID' }
  | { success: false; error: 'INVITE_USED' }
  | { success: false; error: 'INVITE_EXPIRED' }
  | { success: false; error: 'RATE_LIMITED' };

/**
 * Validates an invite code against the `preview_invite_code` RPC without
 * burning a Supabase OTP email. Used by the signup flow's first step
 * to gate progression before asking for an email.
 *
 * The authoritative consume still happens in the `handle_new_user`
 * trigger inside the OTP-verify transaction (race-safe). A code that
 * passes preview here may still fail at verify if it gets used by
 * another caller in between — that surfaces as INVITE_REJECTED.
 */
export async function previewInvite(input: unknown): Promise<PreviewInviteResult> {
  const parsed = PreviewInviteSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { inviteCode: tree.properties?.inviteCode?.errors },
    };
  }

  const supabase = await createClient();
  const { data: status, error } = await supabase
    .rpc('preview_invite_code', { p_code: parsed.data.inviteCode })
    .single<string>();

  if (error) {
    // SE-10: preview_invite_code raises 'RATE_LIMITED' (P0001) when the
    // caller IP exceeds 30 lookups/min. Map it here so the form can
    // surface a friendly retry message instead of generic INVITE_INVALID.
    if (error.message.includes('RATE_LIMITED')) {
      return { success: false, error: 'RATE_LIMITED' };
    }
    logSafe('preview_invite_error', { error: error.message });
    return { success: false, error: 'INVITE_INVALID' };
  }

  if (status === 'used') return { success: false, error: 'INVITE_USED' };
  if (status === 'expired') return { success: false, error: 'INVITE_EXPIRED' };
  if (status !== 'valid') return { success: false, error: 'INVITE_INVALID' };

  return { success: true };
}

// ── sendSigninOtp ────────────────────────────────────────────────────────────

export type SendSigninOtpResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { email?: string[] };
    }
  | { success: false; error: 'EMAIL_NOT_FOUND' }
  | { success: false; error: 'EMAIL_SEND_FAILED' };

/**
 * Sends a 6-digit OTP for the sign-in path.
 *
 * Behaviour depends on ENABLE_INVITES:
 *  - invites ON  + new email → EMAIL_NOT_FOUND (form points to /registracija)
 *  - invites OFF + new email → OTP is sent anyway, Supabase auto-creates
 *    the user on verifyOtp (open-signup mode parity with pre-redesign)
 *  - existing email           → OTP is sent
 *
 * Existence is checked via the auth admin API (paginated listUsers). For
 * the closed-beta scale (≤ a few hundred users) this is cheap; switch
 * to an `email_exists` SECURITY DEFINER RPC if user count grows past a
 * couple thousand.
 */
export async function sendSigninOtp(input: unknown): Promise<SendSigninOtpResult> {
  const parsed = SendSigninOtpSchema.safeParse(input);
  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { email: tree.properties?.email?.errors },
    };
  }

  const { email } = parsed.data;

  if (invitesEnabled() && (await isNewSignup(email))) {
    return { success: false, error: 'EMAIL_NOT_FOUND' };
  }

  return signInWithOtpEmail(email);
}

// ── sendSignupOtp ────────────────────────────────────────────────────────────

export type SendSignupOtpResult =
  | { success: true }
  | {
      success: false;
      error: 'VALIDATION_ERROR';
      details: { email?: string[]; inviteCode?: string[] };
    }
  | { success: false; error: 'EMAIL_ALREADY_EXISTS' }
  | { success: false; error: 'INVITE_REQUIRED' }
  | { success: false; error: 'INVITE_INVALID' }
  | { success: false; error: 'INVITE_USED' }
  | { success: false; error: 'INVITE_EXPIRED' }
  | { success: false; error: 'RATE_LIMITED' }
  | { success: false; error: 'EMAIL_SEND_FAILED' };

/**
 * Sends a 6-digit OTP for a NEW user. Validates the invite code first
 * (when ENABLE_INVITES=true) and refuses if the email already has an
 * account — the form should redirect such users to /prijava.
 *
 * The invite code is validated via preview RPC here (cheap, idempotent)
 * but consumed by the `handle_new_user` trigger atomically inside the
 * OTP-verify transaction.
 */
export async function sendSignupOtp(input: unknown): Promise<SendSignupOtpResult> {
  const parsed = SendSignupOtpSchema.safeParse(input);
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

  const { email, inviteCode } = parsed.data;

  if (!(await isNewSignup(email))) {
    return { success: false, error: 'EMAIL_ALREADY_EXISTS' };
  }

  let dataPayload: Record<string, unknown> | undefined;
  if (invitesEnabled()) {
    if (inviteCode === undefined || inviteCode.length === 0) {
      return { success: false, error: 'INVITE_REQUIRED' };
    }

    const supabase = await createClient();
    const { data: status, error: previewErr } = await supabase
      .rpc('preview_invite_code', { p_code: inviteCode })
      .single<string>();

    if (previewErr) {
      // SE-10: same rate-limit mapping as previewInvite. Reaching here
      // means the user already passed Step 1 (so their IP previously
      // had quota), but the per-IP bucket has since exhausted —
      // surface RATE_LIMITED so the email step can show a retry hint.
      if (previewErr.message.includes('RATE_LIMITED')) {
        return { success: false, error: 'RATE_LIMITED' };
      }
      logSafe('send_signup_invite_preview_error', { error: previewErr.message });
      return { success: false, error: 'INVITE_INVALID' };
    }

    if (status === 'used') return { success: false, error: 'INVITE_USED' };
    if (status === 'expired') return { success: false, error: 'INVITE_EXPIRED' };
    if (status !== 'valid') return { success: false, error: 'INVITE_INVALID' };

    dataPayload = { invite_code: inviteCode };
  }

  return signInWithOtpEmail(email, dataPayload);
}

// ── verifyOtp ────────────────────────────────────────────────────────────────

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

  redirect('/pocetna');
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if `email` is NOT in `auth.users` (i.e., new account).
 * Uses the auth admin API via service role. False on any error — we'd
 * rather treat as "existing user" (lenient gate) than block legitimate
 * sign-ins; the trigger gate stays authoritative on the consume path.
 */
async function isNewSignup(email: string): Promise<boolean> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const lower = email.toLowerCase();
    const PER_PAGE = 200;
    const MAX_PAGES = 50;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        logSafe('is_new_signup_error', { error: error.message, page });
        return false;
      }
      if (data.users.some((u) => u.email?.toLowerCase() === lower)) {
        return false;
      }
      if (data.users.length < PER_PAGE) {
        return true;
      }
    }
    logSafe('is_new_signup_paged_out', { maxPages: MAX_PAGES });
    return false;
  } catch (err) {
    logSafe('is_new_signup_throw', { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * Calls Supabase signInWithOtp with the standard emailRedirectTo. The
 * custom magic-link template at supabase/templates/magic_link.html emits
 * both {{ .ConfirmationURL }} and {{ .Token }}, so users can click the
 * link OR paste the 6-digit code into verifyOtp — whichever is less
 * fragile on their device. Mobile mail clients and corporate antivirus
 * frequently prefetch links, consuming the magic-link code before the
 * user reads the email, so the typed code is the reliable path.
 */
async function signInWithOtpEmail(
  email: string,
  data?: Record<string, unknown>,
): Promise<{ success: true } | { success: false; error: 'EMAIL_SEND_FAILED' }> {
  const siteUrl = mustExist('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data,
    },
  });

  if (error) {
    logSafe('send_otp_error', { error: error.message });
    return { success: false, error: 'EMAIL_SEND_FAILED' };
  }

  return { success: true };
}
