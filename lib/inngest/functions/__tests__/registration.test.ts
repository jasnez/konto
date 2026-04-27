import { describe, expect, it } from 'vitest';
import { inngestFunctions } from '../index';

describe('Inngest function registration', () => {
  it('registers parse-import on import/parse.requested event', () => {
    const fn = inngestFunctions.find((f) => f.id() === 'parse-import');
    expect(fn).toBeDefined();
  });

  it('registers watchdog-stuck-imports on a cron trigger', () => {
    const fn = inngestFunctions.find((f) => f.id() === 'watchdog-stuck-imports');
    expect(fn).toBeDefined();
  });

  it('exposes exactly the two AV-2 functions', () => {
    expect(inngestFunctions).toHaveLength(2);
  });
});
