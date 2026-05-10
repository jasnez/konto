/**
 * Zod schemas for the recurring (pretplate) Server Actions.
 *
 * Mirrors the split in lib/budgets/validation.ts. The detection module
 * (lib/analytics/recurring-detection.ts) emits `RecurringCandidate`s
 * with bigints; this module accepts the same shape but normalises the
 * amount as a decimal string so it can cross the JSON boundary into
 * the `confirm_recurring` RPC payload.
 */
import { z } from 'zod';

const periodEnum = z.enum(['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Datum mora biti YYYY-MM-DD');

const optionalUuid = z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => {
  if (v === null || v === '') return null;
  return v;
});

/**
 * Confirm-recurring input. Mirror of the RecurringCandidate shape from
 * the detector, plus optional override fields the user may set in the
 * confirmation dialog (T3) before persisting.
 */
export const ConfirmRecurringSchema = z.object({
  merchantId: optionalUuid,
  categoryId: optionalUuid,
  accountId: optionalUuid,
  description: z.string().min(1).max(200),
  period: periodEnum,
  /** Always negative for outflows (T1). String to survive JSON; RPC casts to bigint. */
  averageAmountCents: z
    .string()
    .min(1)
    .refine(
      (s) => {
        try {
          const v = BigInt(s.trim());
          return v !== 0n;
        } catch {
          return false;
        }
      },
      { message: 'Iznos mora biti cijeli broj različit od 0' },
    ),
  currency: z.string().length(3),
  lastSeen: isoDate,
  nextExpected: isoDate,
  /** 0..1, optional — manual creates won't have it. */
  confidence: z.number().min(0).max(1).optional(),
  occurrences: z.number().int().min(0),
  /** Existing transactions to back-fill recurring_group_id on. */
  transactionIds: z.array(z.uuid()).default([]),
});

export type ConfirmRecurringInput = z.infer<typeof ConfirmRecurringSchema>;

/** Partial edit. Only fields the user can change post-confirmation; you
 *  cannot retroactively change `lastSeen` / `occurrences` etc. — those
 *  reflect the underlying transaction history. */
export const EditRecurringSchema = z
  .object({
    description: z.string().min(1).max(200).optional(),
    period: periodEnum.optional(),
    averageAmountCents: z
      .string()
      .min(1)
      .refine(
        (s) => {
          try {
            const v = BigInt(s.trim());
            return v !== 0n;
          } catch {
            return false;
          }
        },
        { message: 'Iznos mora biti cijeli broj različit od 0' },
      )
      .optional(),
    currency: z.string().length(3).optional(),
    nextExpectedDate: isoDate.nullable().optional(),
    merchantId: optionalUuid.optional(),
    categoryId: optionalUuid.optional(),
    accountId: optionalUuid.optional(),
  })
  .strict();

export type EditRecurringInput = z.infer<typeof EditRecurringSchema>;

export const RecurringIdParamSchema = z.uuid({ message: 'Neispravan ID pretplate' });

/** Pause requires an explicit `until` date (UI uses a date picker). */
export const PauseRecurringSchema = z.object({
  until: isoDate,
});

export type PauseRecurringInput = z.infer<typeof PauseRecurringSchema>;

export const BindTransactionSchema = z.object({
  transactionId: z.uuid(),
});

export type BindTransactionInput = z.infer<typeof BindTransactionSchema>;
