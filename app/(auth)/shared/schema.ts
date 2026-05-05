import { z } from 'zod';

/**
 * Shared between the client forms (react-hook-form + zodResolver) and the
 * server actions. Single source of truth per `.cursor/rules/server-actions.mdc`.
 * Used by both /prijava and /registracija.
 */

const EmailSchema = z
  .email({ message: 'Ovo ne izgleda kao ispravan email.' })
  .trim()
  .min(1, { message: 'Unesi email adresu.' });

/**
 * Invite ("pozivnica"): 8 characters from a non-ambiguous alphabet —
 * uppercase A–Z minus I/O plus digits 2–9 (no 0, 1, I, O, l so codes
 * survive handwriting, OCR, and SMS without confusion). The generator
 * script and the `handle_new_user` trigger normalise the same way.
 *
 * Two distinct messages:
 *  - length-only error (≠ 8 chars) — terse, common typo
 *  - alphabet error — explicitly lists forbidden characters so the user
 *    knows why a 1 or O was rejected (the original message lied,
 *    saying "8 znakova (slova i brojevi)" when the real problem was a
 *    forbidden digit/letter).
 */
const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .superRefine((value, ctx) => {
    if (value.length !== 8) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pozivnica ima tačno 8 znakova.',
      });
      return;
    }
    if (!/^[A-HJ-NP-Z2-9]{8}$/u.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Pozivnica ne smije sadržavati 0, 1, O, I ili l. Provjeri da nisi pomiješao slova i cifre.',
      });
    }
  });

export const PreviewInviteSchema = z.object({
  inviteCode: InviteCodeSchema,
});
export type PreviewInviteInput = z.infer<typeof PreviewInviteSchema>;

export const SendSigninOtpSchema = z.object({
  email: EmailSchema,
});
export type SendSigninOtpInput = z.infer<typeof SendSigninOtpSchema>;

export const SendSignupOtpSchema = z.object({
  email: EmailSchema,
  inviteCode: InviteCodeSchema.optional(),
});
export type SendSignupOtpInput = z.infer<typeof SendSignupOtpSchema>;

/**
 * 6-digit numeric token from the magic-link email. Custom template at
 * supabase/templates/magic_link.html emits both the link and the token,
 * so users can click OR type — whichever survives their mail client.
 */
export const VerifyOtpSchema = z.object({
  email: EmailSchema,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/u, { message: 'Kod ima 6 cifara.' }),
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
