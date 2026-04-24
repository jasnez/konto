import { z } from 'zod';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/u;

const ALLOWED_CURRENCIES = ['BAM', 'EUR', 'USD', 'HRK', 'RSD', 'GBP', 'CHF'] as const;

export const ReceiptItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit_price: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
});

/**
 * Shape we ask Gemini 2.5 Flash-Lite to return.
 * All fields are nullable because low-quality scans may legitimately lack them,
 * and we still want a row saved for audit + user correction.
 */
export const ExtractedReceiptSchema = z.object({
  total_amount: z.number().nullable(),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .nullable(),
  date: z.string().regex(ISO_DATE_REGEX).nullable(),
  merchant_name: z.string().max(200).nullable(),
  items: z.array(ReceiptItemSchema).max(100).default([]),
  tax_amount: z.number().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

/**
 * Safe fallback used when Gemini returns non-JSON or malformed payload.
 * Keeps the UI functional so the user can still fill in the form manually.
 */
export function emptyExtractedReceipt(): ExtractedReceipt {
  return {
    total_amount: null,
    currency: null,
    date: null,
    merchant_name: null,
    items: [],
    tax_amount: null,
    confidence: 0,
  };
}

export function isSupportedCurrency(code: string | null | undefined): boolean {
  if (!code) return false;
  return (ALLOWED_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}
