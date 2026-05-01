/**
 * ESLint rule: no-untranslated-jsx-strings
 *
 * Flags known anglicisms / English placeholders that have leaked into
 * user-facing JSX text or string literals. The Konto UI is in Bosnian;
 * leftover English labels (Source, Mark as transfer, merchant-om, …) and
 * mangled hybrids (uploaduj) are easy to miss in review and break the
 * "premium feel" promise.
 *
 * What is checked:
 *   - JSXText nodes (text between tags)
 *   - Literal strings inside JSX expression containers ({"…"})
 *   - Template literal quasis inside JSX expression containers
 *
 * What is NOT checked:
 *   - String literals in plain TS/JS (function calls, variables) — those
 *     are usually internal identifiers (slugs, enum values, log keys).
 *   - className strings — never user-visible.
 *   - aria-label / aria-* attributes — caught here too via JSXAttribute path.
 *
 * Suppress with: // eslint-disable-next-line local/no-untranslated-jsx-strings
 *
 * To add a new banned term: extend BANNED_PATTERNS below. Use a regex with
 * word boundaries where the term is a real English word; use a literal
 * substring for mangled hybrids.
 */

/**
 * Each entry pairs a regex (matched case-insensitively) with the suggested
 * replacement message shown to the developer. Keep regexes anchored to whole
 * words to avoid false positives on identifiers ("merchant" vs "merchantId").
 */
const BANNED_PATTERNS = [
  { regex: /\bSource\b/, hint: 'Koristi "Izvor" ili odgovarajući bosanski termin.' },
  { regex: /\bMark\s+as\s+transfer\b/i, hint: 'Koristi "Označi kao transfer".' },
  { regex: /\bmerchant-om\b/i, hint: 'Koristi "ovog prodavača" ili "prodavača".' },
  { regex: /\buploaduj\b/i, hint: 'Koristi "učitaj".' },
  { regex: /Faza\s+\d/i, hint: 'Internal phase markers ne smiju biti u user-facing tekstu.' },
  { regex: /\bSplit\s*\(/i, hint: 'Koristi "Podijeli" za korisnički vidljiv tekst.' },
];

/** Returns the first matching pattern for the given text, or null. */
function findBannedMatch(text) {
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.regex.test(text)) {
      return pattern;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Flag known anglicisms and untranslated English in user-facing JSX strings.',
    },
    messages: {
      banned: 'Anglicism / untranslated English in user-facing string: "{{matched}}". {{hint}}',
    },
    schema: [],
  },
  create(context) {
    function reportIfBanned(node, text) {
      if (typeof text !== 'string' || text.trim().length === 0) return;
      const match = findBannedMatch(text);
      if (!match) return;
      const matched = match.regex.exec(text)?.[0] ?? '';
      context.report({
        node,
        messageId: 'banned',
        data: { matched, hint: match.hint },
      });
    }

    return {
      JSXText(node) {
        reportIfBanned(node, node.value);
      },
      // Catch string literals inside JSX expression containers: {"Source"}
      'JSXExpressionContainer > Literal'(node) {
        reportIfBanned(node, node.value);
      },
      // Catch template literal quasis inside JSX: {`Mark as transfer`}
      'JSXExpressionContainer > TemplateLiteral'(node) {
        for (const quasi of node.quasis) {
          reportIfBanned(quasi, quasi.value.cooked);
        }
      },
    };
  },
};

export default rule;
