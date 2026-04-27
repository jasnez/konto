import { findPhoneNumbersInText } from 'libphonenumber-js';

// ISO 3166-1 alpha-2 country code followed by 2 check digits and up to 30
// alphanumeric BBAN characters (spaces and dashes allowed as separators).
// Covers all countries — not just the Western Balkans subset we had before.
const IBAN_REGEX = /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){10,30}\b/g;

const PAN_CANDIDATE_REGEX = /\b(?:\d[\s-]?){13,19}\b/g;
const JMBG_REGEX = /\b\d{13}\b/g;

// RFC 5322-inspired email regex; deliberately conservative to avoid false
// positives on things like "v2.0" or file paths.
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,253}\.[A-Za-z]{2,}\b/g;

// Default country for libphonenumber-js heuristic parsing. BiH (+387) is the
// most likely country for our users; the library still detects international
// numbers (with +prefix) regardless of this setting.
const DEFAULT_PHONE_COUNTRY = 'BA' as const;

export function redactPII(text: string): string {
  let redacted = text;

  // IBAN: any country prefix → [IBAN-REDACTED]
  redacted = redacted.replace(IBAN_REGEX, '[IBAN-REDACTED]');

  // PAN: mask only Luhn-valid card numbers; keep last 4.
  redacted = redacted.replace(PAN_CANDIDATE_REGEX, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && isLuhnValid(digits)) {
      return `****${digits.slice(-4)}`;
    }
    return match;
  });

  // JMBG: 13 consecutive digits (already narrowed by PAN regex above if
  // Luhn-invalid, but JMBG is never Luhn-valid so both rules are safe).
  redacted = redacted.replace(JMBG_REGEX, '[JMBG-REDACTED]');

  // Email addresses.
  redacted = redacted.replace(EMAIL_REGEX, '[EMAIL-REDACTED]');

  // Phone numbers — use libphonenumber-js for accurate international detection.
  // We iterate in reverse index order so that replacements don't shift offsets.
  const phones = findPhoneNumbersInText(redacted, DEFAULT_PHONE_COUNTRY);
  for (let i = phones.length - 1; i >= 0; i--) {
    const { startsAt, endsAt } = phones[i];
    redacted = redacted.slice(0, startsAt) + '[PHONE-REDACTED]' + redacted.slice(endsAt);
  }

  return redacted;
}

function isLuhnValid(num: string): boolean {
  let sum = 0;
  let alt = false;

  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number.parseInt(num[i] ?? '', 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }

  return sum % 10 === 0;
}
