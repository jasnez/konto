import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

export const CreateInstallmentPlanSchema = z
  .object({
    account_id: z.uuid(),
    merchant_id: z.uuid().nullable().optional(),
    category_id: z.uuid().nullable().optional(),
    currency: z
      .string()
      .length(3)
      .transform((v) => v.toUpperCase()),
    total_cents: z.bigint().refine((v) => v > 0n, 'Ukupan iznos mora biti pozitivan'),
    installment_count: z.number().int().min(2).max(60),
    installment_cents: z.bigint().refine((v) => v > 0n, 'Iznos rate mora biti pozitivan'),
    start_date: z.string().regex(ISO_DATE_REGEX),
    day_of_month: z.number().int().min(1).max(28),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((d) => d.installment_cents <= d.total_cents, {
    message: 'Iznos rate ne može biti veći od ukupnog iznosa.',
    path: ['installment_cents'],
  });

export const CancelInstallmentPlanSchema = z.uuid();

export const MarkOccurrencePaidSchema = z.uuid();

export type CreateInstallmentPlanInput = z.infer<typeof CreateInstallmentPlanSchema>;
