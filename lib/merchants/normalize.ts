/**
 * Normalizes a merchant name into a canonical form for storage and matching:
 * - lowercased (Croatian locale)
 * - BCS Latin diacritics folded (đ→dj, ž→z, š→s, č/ć→c) plus generic NFD strip
 * - common business suffixes stripped (d.o.o., d.d., j.d.o.o., s.p., obrt)
 * - whitespace collapsed to single spaces
 *
 * Returns '' for empty/whitespace-only input or when normalization removes
 * everything (e.g. "d.o.o."). Callers MUST treat '' as "no merchant".
 *
 * Spaces are preserved (unlike slugify which converts them to hyphens).
 */
export function normalizeMerchantName(input: string): string {
  let s = input.trim();
  if (!s) return '';

  s = s.toLocaleLowerCase('hr');

  // Map BCS diacritics matching slugify.ts (đ→dj, ž→z, š→s, č/ć→c).
  s = s.replace(/đ/g, 'dj').replace(/ž/g, 'z').replace(/š/g, 's').replace(/č|ć/g, 'c');

  // Strip remaining accents (e.g. é, ñ) via NFD.
  s = s.normalize('NFD').replace(/\p{M}/gu, '');

  // Strip trailing business suffix. Anchored at end so "d.o.o. dućan" is preserved.
  // Trailing [\s,.\-]* tolerates "Mercator d.o.o.," with stray punctuation after the suffix.
  s = s.replace(/[\s,.\-]*\b(d\.?o\.?o\.?|d\.?d\.?|j\.?d\.?o\.?o\.?|s\.?p\.?|obrt)[\s,.\-]*$/i, '');

  // Collapse whitespace and trim.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
