import { z } from 'zod';
import { CURRENCIES } from '@/lib/accounts/constants';

const accountTypes = z.enum([
  'checking',
  'savings',
  'cash',
  'credit_card',
  'revolut',
  'wise',
  'investment',
  'loan',
  'other',
]);

const baseCurrencies = z.enum(CURRENCIES as unknown as [string, ...string[]]);

const colorField = z
  .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal(''), z.null()])
  .optional()
  .transform((c) => (c === undefined || c === null || c === '' ? null : c));

const initialCentsRefine = (s: string) => {
  const t = s.trim() === '' ? '0' : s.trim();
  try {
    BigInt(t);
    return true;
  } catch {
    return false;
  }
};

const initialCentsStringForm = z
  .string()
  .default('0')
  .refine(initialCentsRefine, { message: 'Iznos nije ispravan cijeli broj' });

const initialCentsStringServer = initialCentsStringForm.transform((s) =>
  BigInt(s.trim() === '' ? '0' : s.trim()),
);

const sharedFieldShape = {
  name: z.string().min(1, 'Naziv je obavezan').max(100),
  type: accountTypes,
  institution: z.string().max(100).optional().nullable(),
  currency: baseCurrencies,
  icon: z.string().max(10).optional().nullable(),
  color: colorField,
};

/**
 * RHF: `initial_balance_cents` ostaje string (nema transform u bigint u tipu)
 */
export const CreateAccountFormSchema = z.object({
  name: sharedFieldShape.name,
  type: sharedFieldShape.type,
  institution: sharedFieldShape.institution,
  currency: sharedFieldShape.currency,
  icon: sharedFieldShape.icon,
  color: sharedFieldShape.color,
  initial_balance_cents: initialCentsStringForm,
  include_in_net_worth: z.boolean(),
});

/**
 * Server Action: nakon parse, `initial_balance_cents` je `bigint`
 */
export const CreateAccountSchema = z.object({
  name: sharedFieldShape.name,
  type: sharedFieldShape.type,
  institution: sharedFieldShape.institution,
  currency: sharedFieldShape.currency,
  icon: sharedFieldShape.icon,
  color: sharedFieldShape.color,
  initial_balance_cents: initialCentsStringServer,
  include_in_net_worth: z.boolean(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type CreateAccountFormValues = z.infer<typeof CreateAccountFormSchema>;

export const AccountFormEditSchema = CreateAccountFormSchema.omit({ initial_balance_cents: true });
export type AccountFormEditValues = z.infer<typeof AccountFormEditSchema>;

export const UpdateAccountSchema = z
  .object({
    name: z.string().min(1, 'Naziv je obavezan').max(100).optional(),
    type: accountTypes.optional(),
    institution: z.string().max(100).optional().nullable(),
    currency: baseCurrencies.optional(),
    icon: z.string().max(10).optional().nullable(),
    color: colorField,
    is_active: z.boolean().optional(),
    include_in_net_worth: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .refine(
    (d) =>
      [
        d.name,
        d.type,
        d.institution,
        d.currency,
        d.icon,
        d.color,
        d.is_active,
        d.include_in_net_worth,
        d.sort_order,
      ].some((v) => v !== undefined),
    { message: 'Mora postojati barem jedno polje' },
  );

const uuidError = { error: () => 'Nevažeći id' } as const;

export const ReorderAccountsSchema = z.array(z.uuid(uuidError));

export const AccountIdParamSchema = z.uuid(uuidError);

export { accountTypes, baseCurrencies };
