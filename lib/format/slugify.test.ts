import { describe, it, expect } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('maps Bosnian diacritics and hyphenates', () => {
    expect(slugify('Opšte troškovi')).toBe('opste-troskovi');
    expect(slugify('Čips i čaj')).toBe('cips-i-caj');
    expect(slugify('Željezara')).toBe('zeljezara');
    expect(slugify('Šoping')).toBe('soping');
    expect(slugify('Đakovo put')).toBe('djakovo-put');
  });

  it('trims and collapses punctuation', () => {
    expect(slugify('  Hello — World!!  ')).toBe('hello-world');
  });

  it('returns empty for whitespace-only', () => {
    expect(slugify('   ')).toBe('');
  });
});
