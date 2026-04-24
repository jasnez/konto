import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;
const MIN_UUID_LIST_SIZE = 1;
const MAX_BULK_DELETE_SIZE = 500;

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value;
}

export const TransactionKindSchema = z.enum(['expense', 'income', 'transfer']);

export const CreateTransactionSchema = z
  .object({
    account_id: z.uuid(),
    to_account_id: z.uuid().optional(),
    amount_cents: z.bigint().refine((value) => value !== 0n, 'Iznos ne može biti 0'),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase()),
    transaction_date: z.string().regex(ISO_DATE_REGEX),
    merchant_raw: z
      .string()
      .max(200)
      .optional()
      .nullable()
      .transform((value) => normalizeOptionalString(value)),
    merchant_id: z
      .union([z.uuid(), z.null()])
      .optional()
      .transform((value) => normalizeOptionalUuid(value)),
    category_id: z
      .union([z.uuid(), z.literal(''), z.null()])
      .optional()
      .transform((value) => normalizeOptionalUuid(value)),
    notes: z
      .string()
      .max(500)
      .optional()
      .nullable()
      .transform((value) => normalizeOptionalString(value)),
  })
  .superRefine((data, ctx) => {
    if (data.to_account_id !== undefined && data.to_account_id === data.account_id) {
      ctx.addIssue({
        code: 'custom',
        message: '"Sa računa" i "Na račun" ne mogu biti isti račun.',
        path: ['to_account_id'],
      });
    }
  });

export const UpdateTransactionSchema = z
  .object({
    account_id: z.uuid().optional(),
    amount_cents: z
      .bigint()
      .refine((value) => value !== 0n, 'Iznos ne može biti 0')
      .optional(),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    transaction_date: z.string().regex(ISO_DATE_REGEX).optional(),
    merchant_raw: z
      .union([z.string().max(200), z.null()])
      .optional()
      .transform((value) => normalizeOptionalString(value)),
    category_id: z
      .union([z.uuid(), z.literal(''), z.null()])
      .optional()
      .transform((value) => normalizeOptionalUuid(value)),
    notes: z
      .union([z.string().max(500), z.null()])
      .optional()
      .transform((value) => normalizeOptionalString(value)),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Mora postojati barem jedno polje za izmjenu.',
  });

export const TransactionIdSchema = z.uuid();

export const BulkDeleteTransactionIdsSchema = z
  .array(z.uuid())
  .min(MIN_UUID_LIST_SIZE)
  .max(MAX_BULK_DELETE_SIZE)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Duplirani ID-evi nisu dozvoljeni.',
  });

export type CreateTransactionInputSchema = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransactionInputSchema = z.infer<typeof UpdateTransactionSchema>;
