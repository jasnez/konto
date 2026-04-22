import { z } from 'zod';

/**
 * Shared between the client form (react-hook-form + zodResolver) and the
 * server action. Single source of truth per `.cursor/rules/server-actions.mdc`.
 */
export const SigninSchema = z.object({
  email: z
    .email({ message: 'Ovo ne izgleda kao ispravan email.' })
    .trim()
    .min(1, { message: 'Unesi email adresu.' }),
});

export type SigninInput = z.infer<typeof SigninSchema>;
