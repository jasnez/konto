import { describe, expect, it } from 'vitest';
import { normalizeMerchantName } from './normalize';

describe('normalizeMerchantName', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeMerchantName('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeMerchantName('   ')).toBe('');
    expect(normalizeMerchantName('\t\n ')).toBe('');
  });

  it('lowercases input', () => {
    expect(normalizeMerchantName('KONZUM')).toBe('konzum');
    expect(normalizeMerchantName('Konzum')).toBe('konzum');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeMerchantName('  Konzum  ')).toBe('konzum');
  });

  it('collapses internal whitespace to single space', () => {
    expect(normalizeMerchantName('Tisak    Plus')).toBe('tisak plus');
    expect(normalizeMerchantName('A\t\tB')).toBe('a b');
  });

  it('strips d.o.o. suffix variants', () => {
    expect(normalizeMerchantName('Konzum d.o.o.')).toBe('konzum');
    expect(normalizeMerchantName('Konzum D.O.O.')).toBe('konzum');
    expect(normalizeMerchantName('Konzum doo')).toBe('konzum');
    expect(normalizeMerchantName('Konzum, d.o.o.')).toBe('konzum');
  });

  it('strips d.d. suffix variants', () => {
    expect(normalizeMerchantName('Bingo d.d.')).toBe('bingo');
    expect(normalizeMerchantName('Bingo dd')).toBe('bingo');
  });

  it('strips j.d.o.o., s.p., obrt suffixes', () => {
    expect(normalizeMerchantName('Pekara j.d.o.o.')).toBe('pekara');
    expect(normalizeMerchantName('Pekara s.p.')).toBe('pekara');
    expect(normalizeMerchantName('Pekara Obrt')).toBe('pekara');
  });

  it('does not strip suffix-like fragments mid-name', () => {
    expect(normalizeMerchantName('d.o.o. dućan')).toBe('d.o.o. ducan');
  });

  it('folds Croatian/Bosnian/Serbian diacritics', () => {
    expect(normalizeMerchantName('Žito Šećer Čokolada Đakovo')).toBe('zito secer cokolada djakovo');
    expect(normalizeMerchantName('Ćevap')).toBe('cevap');
  });

  it('strips generic accents via NFD normalization', () => {
    expect(normalizeMerchantName('Café')).toBe('cafe');
    expect(normalizeMerchantName('Niño')).toBe('nino');
  });

  it('preserves names without suffix', () => {
    expect(normalizeMerchantName('Lidl')).toBe('lidl');
    expect(normalizeMerchantName('Mercator')).toBe('mercator');
  });

  it('handles names with trailing comma + suffix', () => {
    expect(normalizeMerchantName('Mercator d.o.o.,  ')).toBe('mercator');
  });

  it('returns empty string when input is just a stripped suffix', () => {
    expect(normalizeMerchantName('d.o.o.')).toBe('');
    expect(normalizeMerchantName('  d.d.  ')).toBe('');
  });

  it('preserves multi-word merchant names', () => {
    expect(normalizeMerchantName('Tisak Plus')).toBe('tisak plus');
    expect(normalizeMerchantName('AC Petrol Sarajevo')).toBe('ac petrol sarajevo');
  });

  it('handles mixed-case suffixes', () => {
    expect(normalizeMerchantName('KONZUM d.o.o.')).toBe('konzum');
    expect(normalizeMerchantName('Konzum D.o.O.')).toBe('konzum');
  });
});
