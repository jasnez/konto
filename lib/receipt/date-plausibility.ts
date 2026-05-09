/**
 * Pure helpers for assessing how plausible a receipt's transaction_date
 * is. Powers the warning banner in the `/skeniraj` review step (B2,
 * audit 2026-05-08): the OCR can return a misread year (e.g. "2008"
 * when the receipt is actually from 2026), and without a visual cue
 * the user clicks "Sačuvaj" without noticing — the transaction lands
 * with a years-old `transaction_date` and disappears from the default
 * current-month view.
 *
 * Pure / framework-free so it can be unit-tested without React.
 */

export type DatePlausibility =
  /** Date looks fine — no warning to render. */
  | { kind: 'ok' }
  /** Date is more than {days} in the past; surface as caution. */
  | { kind: 'past'; days: number }
  /** Date is in the future. Almost always wrong. */
  | { kind: 'future'; days: number }
  /** Input couldn't be parsed as YYYY-MM-DD. */
  | { kind: 'invalid' };

/** Days in the past beyond which we surface a warning. Tuned to allow
 * legitimate backdating (lost receipt found a few weeks later) while
 * still catching OCR year-mishaps (which always end up 1+ years off). */
const PAST_THRESHOLD_DAYS = 60;

/** Days in the future tolerated. Calendar mismatch (TZ drift, clock
 * skew) can push "today" forward by 1; anything beyond that is real
 * data entry error. */
const FUTURE_THRESHOLD_DAYS = 1;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Decide whether a receipt's `transaction_date` deserves a warning
 * banner in the review form. `today` is required so callers can pass
 * the user's IANA-resolved "today" (avoiding TZ drift around midnight).
 *
 * Both inputs are interpreted as midnight UTC; the function returns
 * the integer day delta (positive = past, negative = future) for the
 * caller to interpolate into copy.
 */
export function assessReceiptDate(transactionDate: string, today: string): DatePlausibility {
  if (!ISO_DATE_RE.test(transactionDate) || !ISO_DATE_RE.test(today)) {
    return { kind: 'invalid' };
  }
  const tx = Date.parse(`${transactionDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(tx) || Number.isNaN(now)) {
    return { kind: 'invalid' };
  }
  const ms = now - tx;
  const days = Math.round(ms / 86_400_000);
  if (days > PAST_THRESHOLD_DAYS) {
    return { kind: 'past', days };
  }
  if (-days > FUTURE_THRESHOLD_DAYS) {
    return { kind: 'future', days: -days };
  }
  return { kind: 'ok' };
}

/**
 * Bosnian-language copy for the warning banner. Co-located with the
 * pure helper so the test snapshots both the threshold logic and the
 * exact copy users see — any drift breaks the test.
 */
export function describePlausibility(p: DatePlausibility, formattedDate: string): string | null {
  if (p.kind === 'ok' || p.kind === 'invalid') {
    return null;
  }
  if (p.kind === 'future') {
    const dayWord = p.days === 1 ? 'dan' : 'dana';
    return `⚠️ Datum ${formattedDate} je u budućnosti (${String(p.days)} ${dayWord}). Provjeri prije nego što sačuvaš.`;
  }
  // Past — humanize for very old dates so "6604 dana" reads as "18 godina".
  if (p.days >= 365) {
    const years = Math.round(p.days / 365);
    const yearWord = years === 1 ? 'godinu' : years < 5 ? 'godine' : 'godina';
    return `⚠️ Datum ${formattedDate} je oko ${String(years)} ${yearWord} u prošlosti — vjerovatno je OCR pogrešno pročitao godinu. Provjeri i ispravi prije nego što sačuvaš.`;
  }
  const dayWord = p.days === 1 ? 'dan' : 'dana';
  return `⚠️ Datum ${formattedDate} je ${String(p.days)} ${dayWord} u prošlosti. Provjeri da nije OCR pogriješio.`;
}
