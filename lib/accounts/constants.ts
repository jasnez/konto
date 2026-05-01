export const CURRENCIES = ['BAM', 'EUR', 'RSD', 'USD', 'GBP', 'CHF', 'MKD', 'HRK'] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

/**
 * @public BiH bank list for institution combobox.
 */
export const BIH_INSTITUTIONS: readonly string[] = [
  'Raiffeisen Bank d.d. BiH',
  'UniCredit Bank d.d. BiH',
  'Intesa Sanpaolo Banka BiH',
  'NLB Banka BiH',
  'Sparkasse Bank BiH',
  'Nova banka',
  'MF banka',
  'ASA Banka',
  'Addiko Bank BiH',
  'ProCredit Bank',
  'Union banka',
  'Ziraat Bank',
  'Privredna banka Sarajevo',
  'Razvojna banka FBiH',
  'Bosna Bank International',
];

/**
 * account.type → emoji + short Bosnian label
 */
export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'checking' as const, emoji: '💳', label: 'Tekući račun' },
  { value: 'savings' as const, emoji: '🏦', label: 'Štedni račun' },
  { value: 'cash' as const, emoji: '💵', label: 'Gotovina' },
  { value: 'credit_card' as const, emoji: '💳', label: 'Kreditna kartica' },
  { value: 'revolut' as const, emoji: '🟣', label: 'Revolut' },
  { value: 'wise' as const, emoji: '🟢', label: 'Wise' },
  { value: 'investment' as const, emoji: '📈', label: 'Investicije' },
  { value: 'loan' as const, emoji: '🏠', label: 'Kredit' },
  { value: 'other' as const, emoji: '📦', label: 'Drugo' },
];

/**
 * Display order for grouping on /racuni — assets first, debt last.
 * Razlikuje se od ACCOUNT_TYPE_OPTIONS (form picker order); ovaj je za list view.
 */
export const ACCOUNT_TYPE_GROUP_ORDER = [
  'checking',
  'savings',
  'cash',
  'revolut',
  'wise',
  'investment',
  'credit_card',
  'loan',
  'other',
] as const;

export type AccountType = (typeof ACCOUNT_TYPE_GROUP_ORDER)[number];

const ACCOUNT_TYPE_LABELS: Record<string, { emoji: string; label: string }> = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.value, { emoji: o.emoji, label: o.label }]),
);

export function getAccountTypeLabel(type: string): { emoji: string; label: string } {
  return ACCOUNT_TYPE_LABELS[type] ?? { emoji: '📦', label: 'Drugo' };
}

const currencyLabels: Record<CurrencyCode, string> = {
  BAM: 'KM (BAM)',
  EUR: '€ (EUR)',
  RSD: 'RSD',
  USD: '$ (USD)',
  GBP: '£ (GBP)',
  CHF: 'CHF',
  MKD: 'MKD',
  HRK: 'HRK',
};

export function getCurrencyLabel(code: CurrencyCode): string {
  return code in currencyLabels ? currencyLabels[code] : code;
}

/** Suggested account icons (emoji picker) */
export const SUGGESTED_ACCOUNT_ICONS = ['💳', '💵', '🏦', '📈', '💰', '🪙', '💶', '💷'] as const;

export const SUGGESTED_ACCOUNT_COLORS = [
  '#22C55E',
  '#3B82F6',
  '#A855F7',
  '#F97316',
  '#E11D48',
  '#0EA5E9',
  '#EAB308',
  '#64748B',
] as const;
