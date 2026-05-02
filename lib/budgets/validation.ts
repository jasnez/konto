/**
 * Zod schemas for budget Server Actions + RHF forms (F3-E1-T2).
 *
 * Mirrors the split in lib/accounts/validation.ts: the Form schema keeps
 * `amount_cents` as a string (RHF-friendly) and the Server schema transforms
 * it into a `bigint` after parse.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/accounts/constants';

const budgetCurrencies = z.enum(CURRENCIES as unknown as [string, ...string[]]);

const budgetPeriods = z.enum(['monthly', 'weekly']);

const amountCentsRefine = (s: string) => {
  const t = s.trim();
  if (t === '') return false;
  try {
    const v = BigInt(t);
    return v > 0n;
  } catch {
    return false;
  }
};

const amountCentsStringForm = z
  .string()
  .min(1, 'Iznos je obavezan')
  .refine(amountCentsRefine, { message: 'Iznos mora biti pozitivan cijeli broj' });

const amountCentsStringServer = amountCentsStringForm.transform((s) => BigInt(s.trim()));

const sharedShape = {
  category_id: z.uuid({ message: 'Kategorija je obavezna' }),
  currency: budgetCurrencies,
  period: budgetPeriods,
  rollover: z.boolean().default(false),
};

/** RHF-friendly form schema (amount_cents stays a string). */
export const CreateBudgetFormSchema = z.object({
  category_id: sharedShape.category_id,
  amount_cents: amountCentsStringForm,
  currency: sharedShape.currency,
  period: sharedShape.period,
  rollover: sharedShape.rollover,
});

/** Server Action schema (amount_cents transformed to bigint). */
export const CreateBudgetSchema = z.object({
  category_id: sharedShape.category_id,
  amount_cents: amountCentsStringServer,
  currency: sharedShape.currency,
  period: sharedShape.period,
  rollover: sharedShape.rollover,
});

/** Partial update — every field optional. category_id changes are allowed
 *  (e.g., re-target a budget) but go through the same ownership check on
 *  the server. */
export const UpdateBudgetSchema = z.object({
  category_id: sharedShape.category_id.optional(),
  amount_cents: amountCentsStringServer.optional(),
  currency: sharedShape.currency.optional(),
  period: sharedShape.period.optional(),
  rollover: z.boolean().optional(),
});

export const BudgetIdParamSchema = z.uuid({ message: 'Neispravan ID budžeta' });

export const ToggleBudgetActiveSchema = z.object({
  active: z.boolean(),
});

export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>;
export type CreateBudgetFormValues = z.infer<typeof CreateBudgetFormSchema>;
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>;
export type ToggleBudgetActiveInput = z.infer<typeof ToggleBudgetActiveSchema>;
