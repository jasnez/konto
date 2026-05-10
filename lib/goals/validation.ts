/**
 * Zod schemas for goals Server Actions + RHF forms.
 *
 * Mirrors the pattern in lib/budgets/validation.ts:
 *   - "Form" schemas keep `amount_cents` as a string (RHF-friendly).
 *   - "Server" schemas transform `amount_cents` → bigint after parse.
 *
 * `color` is validated as `#RRGGBB` hex (matches the DB check constraint).
 * `target_date` is an ISO-8601 date string (YYYY-MM-DD) or absent/null —
 * goals without a deadline are perfectly valid.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/accounts/constants';

const goalCurrencies = z.enum(CURRENCIES as unknown as [string, ...string[]]);

// ─── Amount helpers ───────────────────────────────────────────────────────────

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

const amountCentsNonNegRefine = (s: string) => {
  const t = s.trim();
  if (t === '') return false;
  try {
    const v = BigInt(t);
    return v >= 0n;
  } catch {
    return false;
  }
};

const amountCentsStringForm = z
  .string()
  .min(1, 'Iznos je obavezan')
  .refine(amountCentsRefine, { message: 'Iznos mora biti pozitivan cijeli broj' });

const amountCentsStringServer = amountCentsStringForm.transform((s) => BigInt(s.trim()));

const contributionStringForm = z
  .string()
  .min(1, 'Iznos je obavezan')
  .refine(amountCentsNonNegRefine, { message: 'Iznos mora biti nenegativan cijeli broj' });

const contributionStringServer = contributionStringForm
  .refine(amountCentsRefine, { message: 'Uplata mora biti veća od nule' })
  .transform((s) => BigInt(s.trim()));

// ─── Shared field schemas ─────────────────────────────────────────────────────

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { message: 'Boja mora biti u #RRGGBB formatu' })
  .nullable()
  .optional();

const targetDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Datum mora biti u YYYY-MM-DD formatu' })
  .nullable()
  .optional();

const goalNameSchema = z
  .string()
  .min(1, 'Naziv cilja je obavezan')
  .max(200, 'Naziv cilja ne smije biti duži od 200 znakova')
  .trim();

const sharedCreateShape = {
  name: goalNameSchema,
  currency: goalCurrencies,
  target_date: targetDateSchema,
  account_id: z.uuid({ message: 'Neispravan ID računa' }).nullable().optional(),
  icon: z.string().max(10, 'Ikona je preduga').nullable().optional(),
  color: hexColorSchema,
};

// ─── Create schemas ───────────────────────────────────────────────────────────

/** RHF-friendly form schema (amount_cents stays a string). */
export const CreateGoalFormSchema = z.object({
  ...sharedCreateShape,
  target_amount_cents: amountCentsStringForm,
});

/** Server Action schema (target_amount_cents transformed to bigint). */
export const CreateGoalSchema = z.object({
  ...sharedCreateShape,
  target_amount_cents: amountCentsStringServer,
});

// ─── Update schema ────────────────────────────────────────────────────────────

/** Partial update — every field optional. */
export const UpdateGoalSchema = z.object({
  name: goalNameSchema.optional(),
  target_amount_cents: amountCentsStringServer.optional(),
  currency: goalCurrencies.optional(),
  target_date: targetDateSchema,
  account_id: z.uuid({ message: 'Neispravan ID računa' }).nullable().optional(),
  icon: z.string().max(10).nullable().optional(),
  color: hexColorSchema,
  active: z.boolean().optional(),
});

// ─── addContribution schema ───────────────────────────────────────────────────

/** Form schema — amount_cents stays a string. */
export const AddContributionFormSchema = z.object({
  amount_cents: contributionStringForm,
});

/** Server schema — amount_cents transformed to bigint. */
export const AddContributionSchema = z.object({
  amount_cents: contributionStringServer,
});

// ─── linkAccount schema ───────────────────────────────────────────────────────

/** account_id can be a UUID (link) or null (unlink). */
export const LinkAccountSchema = z.object({
  account_id: z.uuid({ message: 'Neispravan ID računa' }).nullable(),
});

// ─── ID param ─────────────────────────────────────────────────────────────────

export const GoalIdParamSchema = z.uuid({ message: 'Neispravan ID cilja' });

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>;
export type CreateGoalFormValues = z.infer<typeof CreateGoalFormSchema>;
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>;
export type AddContributionInput = z.infer<typeof AddContributionSchema>;
export type AddContributionFormValues = z.infer<typeof AddContributionFormSchema>;
export type LinkAccountInput = z.infer<typeof LinkAccountSchema>;
