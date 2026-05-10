'use server';

/**
 * Admin Server Actions for invite codes.
 *
 * Every action re-validates the admin email gate even though the page
 * layout already does — defense in depth in case the layout check is ever
 * bypassed (route group misconfiguration, intercepted route, etc.).
 *
 * Code generation logic mirrors `scripts/generate-invite-codes.mjs`. For
 * batch generation, prefer the script — this UI flow creates one code per
 * click, suitable for ad-hoc handouts.
 */
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { adminEmail } from '@/lib/auth/invite-config';
import { logSafe } from '@/lib/logger';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export interface AdminActionError {
  success: false;
  error: 'UNAUTHORIZED' | 'FORBIDDEN' | 'DATABASE_ERROR' | 'VALIDATION_ERROR';
  message?: string;
}
export type AdminActionResult = { success: true } | AdminActionError;
export type AdminActionResultWithData<T> = { success: true; data: T } | AdminActionError;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; result: AdminActionError }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { success: false, error: 'UNAUTHORIZED' } };

  const allowed = adminEmail();
  if (allowed === null || (user.email ?? '').toLowerCase() !== allowed) {
    return { ok: false, result: { success: false, error: 'FORBIDDEN' } };
  }
  return { ok: true };
}

const NotesSchema = z
  .object({
    notes: z
      .string()
      .max(200, { message: 'Notes do 200 znakova.' })
      .optional()
      .transform((v) => (v === undefined || v.length === 0 ? null : v)),
  })
  .optional();

/**
 * @public
 * Generates one fresh invite code, inserts it, returns the code string for
 * easy copy-to-clipboard in the admin UI.
 */
export async function createInviteCode(
  input?: unknown,
): Promise<AdminActionResultWithData<{ code: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  const parsed = NotesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'VALIDATION_ERROR', message: 'Notes su predugačke.' };
  }
  const notes = parsed.data?.notes ?? null;

  const code = generateCode();
  const admin = createAdminClient();
  const { error } = await admin.from('invite_codes').insert({ code, notes });

  if (error) {
    logSafe('admin_create_invite_error', { error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/admin/invites');
  return { success: true, data: { code } };
}

/**
 * @public
 * Marks a code as expired (sets `expires_at = now()` so the trigger
 * rejects it). Doesn't delete — preserves audit trail. The cleanup cron
 * will sweep it after the 7-day grace period.
 */
export async function expireInviteCode(input: unknown): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'VALIDATION_ERROR', message: 'Neispravan ID.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('invite_codes')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', parsed.data);

  if (error) {
    logSafe('admin_expire_invite_error', { error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidatePath('/admin/invites');
  return { success: true };
}
