'use server';

/**
 * Server Actions for the onboarding wizard.
 *
 * Three actions:
 *   - `markOnboardingStep(step)` — flips one step to true in the
 *     `profiles.onboarding_completed` jsonb. Idempotent: marking an
 *     already-true step is a no-op success.
 *   - `completeOnboarding(opts?)` — sets `onboarding_completed_at = now()`
 *     and (when `markRemainingTrue: true`) flips every step in the jsonb
 *     to true. Used by the final "Done" handler AND by the global "Preskoči"
 *     button at the top-right of the wizard.
 *   - `resetOnboarding()` — DEV ONLY. Sets `onboarding_completed_at = null`
 *     and `onboarding_completed = '{}'`. Server-side rejects in production.
 *
 * Why three actions instead of one big upsert?
 * ────────────────────────────────────────────
 * The "happy path" — finish step 3, mark it, refresh — is a common operation;
 * keeping it small (single jsonb concat) means the DB write is fast and the
 * action contract is easy to audit. completeOnboarding's two-write semantics
 * (timestamp + optional jsonb fill) only matter at the final step or skip
 * boundary; mixing them into markOnboardingStep would couple unrelated state
 * transitions.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logSafe } from '@/lib/logger';
import type { Database } from '@/supabase/types';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const StepSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export type WizardStepNumber = z.infer<typeof StepSchema>;

const CompleteOnboardingSchema = z
  .object({
    /** When true, also flip every step to true in the jsonb. Used by Skip. */
    markRemainingTrue: z.boolean().optional(),
  })
  .optional();

// ─── Result types ─────────────────────────────────────────────────────────────

function rootErrors(error: z.ZodError): string[] {
  return z.treeifyError(error).errors;
}

export type MarkStepResult =
  | { success: true }
  | { success: false; error: 'VALIDATION_ERROR'; details: { _root: string[] } }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type CompleteOnboardingResult =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'DATABASE_ERROR' };

export type ResetOnboardingResult =
  | { success: true }
  | { success: false; error: 'UNAUTHORIZED' }
  | { success: false; error: 'FORBIDDEN' }
  | { success: false; error: 'DATABASE_ERROR' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Type guard for the jsonb shape we read back from the DB. Defensive: a row
 * could in theory have any shape (jsonb is structurally typed); fall back
 * to an empty object if the value is malformed.
 */
function asStepMap(v: unknown): Record<string, boolean> {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

function revalidateOnboardingPaths(): void {
  revalidatePath('/pocetna');
  revalidatePath('/podesavanja');
}

// ─── markOnboardingStep ───────────────────────────────────────────────────────

/**
 * @public
 * Marks a wizard step as completed by merging `{ stepN: true }` into the
 * `profiles.onboarding_completed` jsonb. Read-modify-write — there is no
 * Postgres jsonb_set RPC for this in the schema, but the row is owned by
 * one user and changes only via this action, so a benign last-write-wins
 * is acceptable.
 */
export async function markOnboardingStep(step: unknown): Promise<MarkStepResult> {
  const parsed = StepSchema.safeParse(step);
  if (!parsed.success) {
    return {
      success: false,
      error: 'VALIDATION_ERROR',
      details: { _root: rootErrors(parsed.error) },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  // Read current jsonb so we don't clobber sibling keys.
  const { data: profile, error: selErr } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (selErr) {
    logSafe('mark_onboarding_step_select', { userId: user.id, error: selErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  const current = asStepMap(profile?.onboarding_completed);
  const next = { ...current, [`step${String(parsed.data)}`]: true };

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ onboarding_completed: next })
    .eq('id', user.id);

  if (upErr) {
    logSafe('mark_onboarding_step_update', {
      userId: user.id,
      step: parsed.data,
      error: upErr.message,
    });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateOnboardingPaths();
  return { success: true };
}

// ─── completeOnboarding ───────────────────────────────────────────────────────

/**
 * @public
 * Marks the wizard fully done. Two flavours:
 *   - Default: sets `onboarding_completed_at = now()` only (used at final
 *     "Done" step where every individual step has already been marked).
 *   - `{ markRemainingTrue: true }`: also flips every step to true in the
 *     jsonb (used by the global "Preskoči" button so the user doesn't see
 *     a half-checked progress bar if they ever reset).
 */
export async function completeOnboarding(options?: unknown): Promise<CompleteOnboardingResult> {
  const parsed = CompleteOnboardingSchema.safeParse(options);
  // Schema is .optional() with .optional() fields — invalid is unreachable
  // unless caller passes a wrong type. Treat as no-op shape if so.
  const opts = parsed.success ? (parsed.data ?? {}) : {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const updatePayload: ProfileUpdate = {
    onboarding_completed_at: new Date().toISOString(),
  };
  if (opts.markRemainingTrue === true) {
    updatePayload.onboarding_completed = {
      step1: true,
      step2: true,
      step3: true,
      step4: true,
    };
  }

  const { error: upErr } = await supabase.from('profiles').update(updatePayload).eq('id', user.id);

  if (upErr) {
    logSafe('complete_onboarding_update', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateOnboardingPaths();
  return { success: true };
}

// ─── resetOnboarding ──────────────────────────────────────────────────────────

/**
 * @public
 * DEV ONLY. Clears both `onboarding_completed_at` and `onboarding_completed`
 * so the wizard reappears on the next pocetna render. Refuses to run when
 * `NODE_ENV === 'production'` regardless of caller — defense in depth in
 * case the dev button somehow ships into production.
 */
export async function resetOnboarding(): Promise<ResetOnboardingResult> {
  if (process.env.NODE_ENV === 'production') {
    return { success: false, error: 'FORBIDDEN' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'UNAUTHORIZED' };
  }

  const { error: upErr } = await supabase
    .from('profiles')
    .update({
      onboarding_completed_at: null,
      onboarding_completed: {},
    })
    .eq('id', user.id);

  if (upErr) {
    logSafe('reset_onboarding_update', { userId: user.id, error: upErr.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  revalidateOnboardingPaths();
  return { success: true };
}
