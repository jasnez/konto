import { z } from 'zod';

/**
 * Shared between the client forms (react-hook-form + zodResolver) and the
 * server actions. Single source of truth per `.cursor/rules/server-actions.mdc`.
 * Used by both /prijava and /registracija.
 */
export const SendOtpSchema = z.object({
  email: z
    .email({ message: 'Ovo ne izgleda kao ispravan email.' })
    .trim()
    .min(1, { message: 'Unesi email adresu.' }),
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
