/**
 * URL-safe slug: lowercase a–z, 0–9, hyphen.
 * Maps Bosnian/Croatian/Serbian Latin letters per product rules (č/ć→c, ž→z, š→s, đ→dj).
 */
export function slugify(input: string): string {
  let s = input.trim();
  if (!s) return '';

  s = s.replace(/đ/gi, 'dj').replace(/ž/gi, 'z').replace(/š/gi, 's').replace(/č|ć/gi, 'c');

  s = s.normalize('NFD').replace(/\p{M}/gu, '');

  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
