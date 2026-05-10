import { z } from 'zod';

/**
 * Must match the CHECK constraints on public.profiles (base_currency, locale).
 * See supabase/migrations/..._initial_schema.sql for the original allow-lists
 * and ..._simplify_currency_locale.sql for the currently-narrowed set.
 * Kept as constants so the <Select> options in the client form and the Zod
 * enum here stay in sync.
 */
export const BASE_CURRENCIES = ['BAM', 'EUR', 'USD'] as const;
export const LOCALES = ['bs-BA', 'en-US'] as const;

export type BaseCurrency = (typeof BASE_CURRENCIES)[number];
export type Locale = (typeof LOCALES)[number];

export const CURRENCY_LABELS: Record<BaseCurrency, string> = {
  BAM: 'BAM — Konvertibilna marka',
  EUR: 'EUR — Euro',
  USD: 'USD — Američki dolar',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'bs-BA': 'Bosanski',
  'en-US': 'English',
};

export const UpdateProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, { message: 'Unesi ime od najmanje 1 znaka.' })
    .max(100, { message: 'Najviše 100 znakova.' }),
  base_currency: z.enum(BASE_CURRENCIES),
  locale: z.enum(LOCALES),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
