const IBAN_REGEX = /\b(?:BA|HR|SI|RS|ME|MK)\d{2}(?:[\s-]?[A-Z0-9]){10,30}\b/g;
const PAN_CANDIDATE_REGEX = /\b(?:\d[\s-]?){13,19}\b/g;
const JMBG_REGEX = /\b\d{13}\b/g;

export function redactPII(text: string): string {
  let redacted = text;

  // IBAN: BA39 1290... -> [IBAN-REDACTED]
  redacted = redacted.replace(IBAN_REGEX, '[IBAN-REDACTED]');

  // PAN: mask only valid card numbers by Luhn; keep last 4.
  redacted = redacted.replace(PAN_CANDIDATE_REGEX, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && isLuhnValid(digits)) {
      return `****${digits.slice(-4)}`;
    }
    return match;
  });

  // JMBG: 13 digits.
  redacted = redacted.replace(JMBG_REGEX, '[JMBG-REDACTED]');

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
