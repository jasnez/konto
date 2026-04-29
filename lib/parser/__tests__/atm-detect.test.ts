import { describe, expect, it } from 'vitest';

import { isLikelyAtmDescription } from '../atm-detect';

describe('isLikelyAtmDescription', () => {
  it('matches common Bosnian / English ATM descriptions', () => {
    expect(isLikelyAtmDescription('SPARKASSE ATM ISPLATA')).toBe(true);
    expect(isLikelyAtmDescription('ATM ISPLATA SARAJEVO')).toBe(true);
    expect(isLikelyAtmDescription('ISPLATA NA BANKOMATU')).toBe(true);
    expect(isLikelyAtmDescription('Bankomat Hrvatska Banka')).toBe(true);
    expect(isLikelyAtmDescription('PODIZANJE GOTOVINE')).toBe(true);
  });

  it('does not match unrelated descriptions that contain ATM as a substring', () => {
    expect(isLikelyAtmDescription('ATMOSFERA D.O.O.')).toBe(false);
    expect(isLikelyAtmDescription('PATMOS RESTORAN')).toBe(false);
    expect(isLikelyAtmDescription('BINGO MARKET SARAJEVO')).toBe(false);
  });

  it('handles null and empty input', () => {
    expect(isLikelyAtmDescription(null)).toBe(false);
    expect(isLikelyAtmDescription(undefined)).toBe(false);
    expect(isLikelyAtmDescription('')).toBe(false);
  });
});
