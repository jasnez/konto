// Heuristic ATM-line detector for parsed bank-statement descriptions.
// Used by the import review UI to flag rows that look like ATM cash
// withdrawals so the user can route them to a Cash account instead of
// importing them as regular expenses.
//
// Word-boundary anchors guard against false positives on unrelated tokens
// like "ATMOSFERA" or product names that happen to contain the substring.
const ATM_PATTERN = /\b(ATM|BANKOMAT(?:U|A)?|ISPLATA NA BANK|PODIZAN[JE](?:E|A)?|WPLATOMAT)\b/iu;

export function isLikelyAtmDescription(description: string | null | undefined): boolean {
  if (!description) return false;
  return ATM_PATTERN.test(description);
}
