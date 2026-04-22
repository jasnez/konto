import { z } from 'zod';

/**
 * Must match the check constraints in supabase/migrations/..._initial_schema.sql
 * on public.profiles (base_currency, locale). Kept as constants so the <Select>
 * options in the client form and the enum here stay in sync.
 */
export const BASE_CURRENCIES = ['BAM', 'EUR', 'RSD', 'USD', 'GBP', 'CHF', 'MKD', 'HRK'] as const;
export const LOCALES = ['bs-BA', 'sr-RS-Latn', 'sr-RS-Cyrl', 'hr-HR', 'mk-MK', 'en-US'] as const;

export type BaseCurrency = (typeof BASE_CURRENCIES)[number];
export type Locale = (typeof LOCALES)[number];

export const CURRENCY_LABELS: Record<BaseCurrency, string> = {
  BAM: 'BAM — Konvertibilna marka',
  EUR: 'EUR — Euro',
  RSD: 'RSD — Srpski dinar',
  USD: 'USD — Američki dolar',
  GBP: 'GBP — Britanska funta',
  CHF: 'CHF — Švicarski franak',
  MKD: 'MKD — Makedonski denar',
  HRK: 'HRK — Hrvatska kuna',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'bs-BA': 'Bosanski (latinica)',
  'sr-RS-Latn': 'Srpski (latinica)',
  'sr-RS-Cyrl': 'Srpski (ćirilica)',
  'hr-HR': 'Hrvatski',
  'mk-MK': 'Makedonski',
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
