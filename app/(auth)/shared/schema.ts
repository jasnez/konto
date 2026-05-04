import { z } from 'zod';

/**
 * Shared between the client forms (react-hook-form + zodResolver) and the
 * server actions. Single source of truth per `.cursor/rules/server-actions.mdc`.
 * Used by both /prijava and /registracija.
 */
/**
 * Invite code shape: 8 characters from a non-ambiguous alphabet — uppercase
 * A–Z minus I/O plus digits 2–9 (no 0/O/1/I/l so handwritten/typed codes
 * don't get confused). The generator script uses the same alphabet.
 *
 * Always uppercased before validation so users can type either case. The
 * trigger normalises with `upper()` too. Optional in the schema —
 * required-or-not is decided at the Server Action layer based on
 * `ENABLE_INVITES` env var (per F4-E2-T1).
 */
const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/u, { message: 'Kod ima 8 znakova (slova i brojevi).' })
  .optional();

export const SendOtpSchema = z.object({
  email: z
    .email({ message: 'Ovo ne izgleda kao ispravan email.' })
    .trim()
    .min(1, { message: 'Unesi email adresu.' }),
  inviteCode: InviteCodeSchema,
});

export type SendOtpInput = z.infer<typeof SendOtpSchema>;

/**
 * Verifying a 6-digit code from the email. Supabase always sends a 6-digit
 * token together with the magic link under the default "Magic Link" template,
 * so users can either click the link or type the code — whatever is easier
 * on their device.
 */
export const VerifyOtpSchema = z.object({
  email: z.email().trim().min(1),
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/u, { message: 'Kod ima 6 cifara.' }),
});

export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
