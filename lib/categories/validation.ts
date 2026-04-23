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

const parentIdField = z
  .union([z.uuid(uuidErr), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || v === '' ? null : v));

export const CategorySchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(50)),
  slug: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, {
          message: 'Samo latinična slova, brojevi i crtica',
        }),
    ),
  icon: iconField,
  color: colorField,
  kind: z.enum(['expense', 'income', 'transfer', 'saving', 'investment']),
  parent_id: parentIdField,
});

export type CategoryInput = z.infer<typeof CategorySchema>;

export const CategoryIdSchema = z.uuid(uuidErr);

export const ReorderCategoriesSchema = z
  .array(z.uuid(uuidErr))
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplirani id-evi' });

export const UpdateCategorySchema = CategorySchema.partial().refine(
  (d) => [d.name, d.slug, d.icon, d.color, d.kind, d.parent_id].some((v) => v !== undefined),
  { message: 'Mora postojati barem jedno polje' },
);

export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

/** Samo polja dozvoljena za sistemske kategorije u formi. */
export const EditSystemCategoryFormSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(50)),
  icon: iconField,
  color: colorField,
});

export type EditSystemCategoryFormValues = z.infer<typeof EditSystemCategoryFormSchema>;
