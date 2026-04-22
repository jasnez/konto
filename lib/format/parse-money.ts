/**
 * Parses a user-typed money string to minor units (cents) as BigInt.
 * Obeys locale: bs-BA uses `,` decimal and `.` thousands; en-US uses `.` decimal and `,` thousands.
 */

const UNICODE_MINUS = '\u2212';
const MAX_SAFE = 9223372036854775807n;

function applySign(negative: boolean, absCents: bigint): bigint {
  return negative ? -absCents : absCents;
}

/**
 * @param intStr - Integer part (no grouping separators)
 * @param fracStr - 0–2 digit fractional part
 */
function toCentsFromParts(intStr: string, fracStr: string): bigint | null {
  if (fracStr.length > 2) {
    return null;
  }
  if (!/^\d*$/.test(fracStr)) {
    return null;
  }
  if (intStr.length > 0 && !/^\d+$/.test(intStr)) {
    return null;
  }
  if (intStr === '' && fracStr === '') {
    return null;
  }

  const intPart = intStr.length === 0 ? 0n : BigInt(intStr);
  let fracCents = 0n;
  if (fracStr.length === 0) {
    fracCents = 0n;
  } else if (fracStr.length === 1) {
    if (!/^\d$/.test(fracStr)) {
      return null;
    }
    fracCents = BigInt(fracStr) * 10n;
  } else {
    if (!/^\d{2}$/.test(fracStr)) {
      return null;
    }
    fracCents = BigInt(fracStr);
  }

  const v = intPart * 100n + fracCents;
  if (v > MAX_SAFE) {
    return null;
  }
  return v;
}

function isThousandsOnlyGroupBs(s: string): boolean {
  if (!s.includes('.')) {
    return /^\d+$/.test(s);
  }
  return /^(\d{1,3})(\.\d{3})+$/.test(s) || /^\d+$/.test(s);
}

function parseBsBA(s0: string, neg: boolean): bigint | null {
  const s = s0;
  if (s.includes(',')) {
    if ((s.match(/,/g) ?? []).length > 1) {
      return null;
    }
    const [intWithDots, rawFrac] = s.split(',') as [string, string | undefined];
    if (rawFrac === undefined) {
      return null;
    }
    if (rawFrac.includes('.') || rawFrac.includes(',')) {
      return null;
    }
    if (!/^[\d.]*$/u.test(intWithDots)) {
      return null;
    }
    if (!/^\d*$/u.test(rawFrac)) {
      return null;
    }
    if (intWithDots.length === 0 && rawFrac.length === 0) {
      return null;
    }
    const intPart = intWithDots.replace(/\./g, '');
    const c = toCentsFromParts(intPart, rawFrac);
    if (c === null) {
      return null;
    }
    return applySign(neg, c);
  }

  if (s.includes('.') && !isThousandsOnlyGroupBs(s)) {
    return null;
  }
  const intPart = s.replace(/\./g, '');
  if (intPart === '' || !/^\d+$/u.test(intPart)) {
    return null;
  }
  const c = toCentsFromParts(intPart, '');
  if (c === null) {
    return null;
  }
  return applySign(neg, c);
}

/**
 * en-US: strip thousands commas, then use last `.` as decimal. No dot → entire string is an integer in major units (×100 for cents).
 */
function parseEnUS(s0: string, neg: boolean): bigint | null {
  if (s0 === '') {
    return null;
  }
  const s1 = s0.replace(/,/g, '');
  const last = s1.lastIndexOf('.');

  if (last < 0) {
    if (!/^\d+$/u.test(s1)) {
      return null;
    }
    const c = toCentsFromParts(s1, '');
    if (c === null) {
      return null;
    }
    return applySign(neg, c);
  }

  const fr = s1.slice(last + 1);
  if (fr.length === 0 || !/^\d*$/u.test(fr) || fr.length > 2) {
    return null;
  }
  const intWithSeps = s1.slice(0, last);
  if (intWithSeps === '') {
    return null;
  }
  const intPart = intWithSeps.replace(/\./g, '');
  if (!/^\d+$/u.test(intPart)) {
    return null;
  }
  const c = toCentsFromParts(intPart, fr);
  if (c === null) {
    return null;
  }
  return applySign(neg, c);
}

/**
 * @param input - User input; internal whitespace = invalid
 * @param locale - e.g. `bs-BA`, `en-US`
 * @returns Minor units, or `null` if not parseable
 */
export function parseMoneyString(input: string, locale = 'bs-BA'): bigint | null {
  const t0 = input.trim();
  if (t0 === '') {
    return null;
  }
  if (/\s/.test(t0)) {
    return null;
  }

  let neg = false;
  let t = t0;
  if (t.startsWith('-') || t.startsWith(UNICODE_MINUS)) {
    neg = true;
    t = t.slice(1);
  } else if (t.startsWith('+')) {
    return null;
  }

  if (t === '') {
    return null;
  }
  if (t.startsWith('-') || t.startsWith(UNICODE_MINUS) || t.startsWith('+')) {
    return null;
  }

  const l = locale.toLowerCase();
  if (l === 'en-us' || l === 'en_us' || l === 'en') {
    return parseEnUS(t, neg);
  }
  return parseBsBA(t, neg);
}
