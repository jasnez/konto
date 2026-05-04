/**
 * Bosnian relative-time formatter.
 *
 * Avoids `date-fns/locale/bs` so we have full copy control and do not depend
 * on the locale availability in the installed date-fns version. Output is
 * deterministic across server and client (no Intl.RelativeTimeFormat) so
 * SSR/CSR don't drift.
 *
 * Examples (locale 'bs-BA'):
 *   - 0–59s    → "upravo"
 *   - 1–59min  → "Prije {n} {minute|minute|minuta}"
 *   - 1–23h    → "Prije {n} {sat|sata|sati}"
 *   - 1–6d     → "Prije {n} {dan|dana|dana}"
 *   - 7–29d    → "Prije {n} {sedmicu|sedmice|sedmica}"
 *   - 30–365d  → "Prije {n} {mjesec|mjeseca|mjeseci}"
 *   - >365d    → "Prije {n} {godinu|godine|godina}"
 *
 * Bosnian plural rule (paucal): noun form depends on the trailing two digits.
 *   - n % 10 === 1 && n % 100 !== 11 → singular
 *   - n % 10 in [2..4] && n % 100 not in [12..14] → paucal (2-4 form)
 *   - else → plural
 */

interface PluralForms {
  /** Singular: "1 minut" — used when n % 10 === 1 && n % 100 !== 11. */
  one: string;
  /** Paucal: "2 minute" — used when n % 10 in [2,3,4] && n % 100 not in [12-14]. */
  few: string;
  /** Plural: "5 minuta" — everything else. */
  many: string;
}

function plural(n: number, forms: PluralForms): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
}

const MINUTES: PluralForms = { one: 'minutu', few: 'minute', many: 'minuta' };
const HOURS: PluralForms = { one: 'sat', few: 'sata', many: 'sati' };
const DAYS: PluralForms = { one: 'dan', few: 'dana', many: 'dana' };
const WEEKS: PluralForms = { one: 'sedmicu', few: 'sedmice', many: 'sedmica' };
const MONTHS: PluralForms = { one: 'mjesec', few: 'mjeseca', many: 'mjeseci' };
const YEARS: PluralForms = { one: 'godinu', few: 'godine', many: 'godina' };

/** Returns "Prije N <unit>" or "upravo" / "u budućnosti" for edge cases. */
export function formatRelativeBs(date: Date | string, now: Date = new Date()): string {
  const target = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - target.getTime();
  if (Number.isNaN(diffMs)) return '';

  // Future-dated rows (e.g., clock skew, timezone weirdness): show neutrally.
  if (diffMs < -60_000) return 'u budućnosti';

  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  if (diffSec < 60) return 'upravo';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Prije ${String(diffMin)} ${plural(diffMin, MINUTES)}`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `Prije ${String(diffHour)} ${plural(diffHour, HOURS)}`;
  }

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return `Prije ${String(diffDay)} ${plural(diffDay, DAYS)}`;
  }
  if (diffDay < 30) {
    const diffWeek = Math.floor(diffDay / 7);
    return `Prije ${String(diffWeek)} ${plural(diffWeek, WEEKS)}`;
  }
  if (diffDay < 365) {
    const diffMonth = Math.floor(diffDay / 30);
    return `Prije ${String(diffMonth)} ${plural(diffMonth, MONTHS)}`;
  }
  const diffYear = Math.floor(diffDay / 365);
  return `Prije ${String(diffYear)} ${plural(diffYear, YEARS)}`;
}
