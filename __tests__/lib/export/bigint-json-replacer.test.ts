import { describe, expect, it } from 'vitest';
import { bigintJsonReplacer } from '@/lib/export/bigint-json-replacer';

describe('bigintJsonReplacer', () => {
  it('serializes nested bigint as decimal string', () => {
    const json = JSON.stringify({ a: 1n, nested: { b: 9007199254740993n } }, bigintJsonReplacer);
    expect(json).toBe('{"a":"1","nested":{"b":"9007199254740993"}}');
  });
});
