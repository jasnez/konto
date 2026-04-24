import { describe, expect, it } from 'vitest';
import { findFirstMerchantAliasMatch, type MerchantAliasForMatch } from '../merchant-alias-match';

const base = (overrides: Partial<MerchantAliasForMatch>): MerchantAliasForMatch => ({
  merchantId: 'm1',
  defaultCategoryId: 'c1',
  pattern: 'X',
  patternType: 'contains',
  ...overrides,
});

describe('findFirstMerchantAliasMatch', () => {
  it('prefers exact over contains', () => {
    const hit = findFirstMerchantAliasMatch('BINGO MARKET', [
      base({ merchantId: 'a', pattern: 'ING', patternType: 'contains' }),
      base({ merchantId: 'b', pattern: 'BINGO MARKET', patternType: 'exact' }),
    ]);
    expect(hit?.merchantId).toBe('b');
  });

  it('matches contains case-insensitively', () => {
    const hit = findFirstMerchantAliasMatch('  bingo  ', [
      base({ merchantId: 'x', pattern: 'bing', patternType: 'contains' }),
    ]);
    expect(hit?.merchantId).toBe('x');
  });

  it('returns null when nothing matches', () => {
    expect(
      findFirstMerchantAliasMatch('foo', [base({ pattern: 'bar', patternType: 'exact' })]),
    ).toBeNull();
  });
});
