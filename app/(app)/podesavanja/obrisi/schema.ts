import { z } from 'zod';

export const RequestAccountDeletionSchema = z.object({
  email: z
    .email({ message: 'Unesi ispravan email.' })
    .trim()
    .min(1, { message: 'Unesi email adresu.' }),
  understood: z.boolean().refine(Boolean, {
    message: 'Moraš potvrditi da razumiješ posljedice.',
  }),
});

export type RequestAccountDeletionInput = z.infer<typeof RequestAccountDeletionSchema>;
