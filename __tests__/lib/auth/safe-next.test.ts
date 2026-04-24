import { describe, expect, it } from 'vitest';
import { DEFAULT_SAFE_NEXT, sanitizeNextPath } from '@/lib/auth/safe-next';

describe('sanitizeNextPath', () => {
  describe('accepts in-app paths', () => {
    it.each([
      '/pocetna',
      '/transakcije',
      '/racuni/abc',
      '/podesavanja/obrisi',
      '/transakcije?from=2026-01-01',
      '/racuni/abc?filter=type#tab',
      '/a',
    ])('allows %s', (value) => {
      expect(sanitizeNextPath(value)).toBe(value);
    });
  });

  describe('blocks open redirects', () => {
    it.each([
      ['null input', null],
      ['undefined input', undefined],
      ['empty string', ''],
      ['external URL', 'https://evil.com'],
      ['external URL no-scheme', 'evil.com/abc'],
      ['relative path', 'racuni'],
      ['protocol-relative', '//evil.com'],
      ['protocol-relative path', '//evil.com/path'],
      ['backslash normalization', '/\\evil.com'],
      ['mixed slash/backslash', '/\\/evil.com'],
      ['backslash embedded', '/foo\\bar'],
      ['javascript: not starting with /', 'javascript:alert(1)'],
      ['data: URI', 'data:text/html,<script>alert(1)</script>'],
      ['whitespace prefix', ' /pocetna'],
    ])('rejects %s', (_label, value) => {
      expect(sanitizeNextPath(value)).toBe(DEFAULT_SAFE_NEXT);
    });
  });

  describe('blocks control characters', () => {
    it.each([
      ['CR injection', '/pocetna\r\nLocation: https://evil'],
      ['LF injection', '/pocetna\nset-cookie: x=y'],
      ['NUL byte', '/pocetna\u0000/foo'],
      ['TAB', '/pocetna\tfoo'],
      ['DEL', '/pocetna\u007f'],
    ])('rejects %s', (_label, value) => {
      expect(sanitizeNextPath(value)).toBe(DEFAULT_SAFE_NEXT);
    });
  });

  describe('bounds', () => {
    it('rejects absurdly long paths', () => {
      const tooLong = '/' + 'a'.repeat(600);
      expect(sanitizeNextPath(tooLong)).toBe(DEFAULT_SAFE_NEXT);
    });

    it('accepts a path up to 512 chars', () => {
      const justUnder = '/' + 'a'.repeat(511);
      expect(sanitizeNextPath(justUnder)).toBe(justUnder);
    });
  });

  describe('non-string inputs', () => {
    it.each([
      ['number', 123 as unknown as string],
      ['object', {} as unknown as string],
      ['array', [] as unknown as string],
    ])('rejects %s', (_label, value) => {
      expect(sanitizeNextPath(value)).toBe(DEFAULT_SAFE_NEXT);
    });
  });
});
