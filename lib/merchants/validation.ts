import { z } from 'zod';

const uuidErr = { error: () => 'Nevažeći id' } as const;

const colorField = z
  .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal(''), z.null()])
  .optional()
  .transform((c) => (c === undefined || c === null || c === '' ? null : c));

const iconField = z
  .union([z.string().max(10), z.literal('')])
  .optional()
  .nullable()
  .transform((s) => (s === undefined || s === null || s === '' ? null : s));

const categoryIdField = z
  .union([z.uuid(uuidErr), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || v === '' ? null : v));

export const CreateMerchantSchema = z.object({
  canonical_name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(120)),
  display_name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(120)),
  default_category_id: categoryIdField,
  icon: iconField,
  color: colorField,
});

export type CreateMerchantInput = z.infer<typeof CreateMerchantSchema>;

export const MerchantIdSchema = z.uuid(uuidErr);

export const UpdateMerchantSchema = CreateMerchantSchema.partial().refine(
  (d) =>
    [d.canonical_name, d.display_name, d.default_category_id, d.icon, d.color].some(
      (v) => v !== undefined,
    ),
  { message: 'Mora postojati barem jedno polje' },
);

export type UpdateMerchantInput = z.infer<typeof UpdateMerchantSchema>;

export const SearchMerchantsParamsSchema = z.object({
  query: z.string().max(200),
  limit: z.coerce.number().int().min(1).max(50),
});

export type SearchMerchantsParams = z.infer<typeof SearchMerchantsParamsSchema>;
