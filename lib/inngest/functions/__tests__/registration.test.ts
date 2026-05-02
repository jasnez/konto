import { describe, expect, it } from 'vitest';
import { inngestFunctions } from '../index';

describe('Inngest function registration', () => {
  it('registers parse-import on import/parse.requested event', () => {
    const fn = inngestFunctions.find((f) => f.id() === 'parse-import');
    expect(fn).toBeDefined();
  });

  it('exposes exactly the parse-import function', () => {
    expect(inngestFunctions).toHaveLength(1);
  });
});
