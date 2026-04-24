export type AliasPatternType = 'exact' | 'contains' | 'starts_with' | 'regex';

export interface MerchantAliasForMatch {
  merchantId: string;
  defaultCategoryId: string | null;
  pattern: string;
  patternType: AliasPatternType;
}

function rankPatternType(t: AliasPatternType): number {
  switch (t) {
    case 'exact':
      return 0;
    case 'starts_with':
      return 1;
    case 'contains':
      return 2;
    case 'regex':
      return 3;
    default: {
      const _exhaustive: never = t;
      return _exhaustive;
    }
  }
}

function normalizeUpper(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * First matching alias wins after deterministic ordering (type priority, then longer pattern).
 */
export function findFirstMerchantAliasMatch(
  rawDescription: string,
  aliases: MerchantAliasForMatch[],
): { merchantId: string; categoryId: string | null } | null {
  const desc = rawDescription.trim();
  if (desc.length === 0 || aliases.length === 0) {
    return null;
  }

  const sorted = [...aliases].sort((a, b) => {
    const tr = rankPatternType(a.patternType) - rankPatternType(b.patternType);
    if (tr !== 0) return tr;
    return b.pattern.length - a.pattern.length;
  });

  const normDesc = normalizeUpper(desc);

  for (const a of sorted) {
    const p = a.pattern.trim();
    if (p.length === 0) continue;
    try {
      let hit = false;
      switch (a.patternType) {
        case 'exact':
          hit = normDesc === normalizeUpper(p);
          break;
        case 'starts_with':
          hit = normDesc.startsWith(normalizeUpper(p));
          break;
        case 'contains':
          hit = normDesc.includes(normalizeUpper(p));
          break;
        case 'regex':
          hit = new RegExp(p, 'iu').test(desc);
          break;
      }
      if (hit) {
        return { merchantId: a.merchantId, categoryId: a.defaultCategoryId };
      }
    } catch {
      // Invalid regex — skip.
    }
  }

  return null;
}
