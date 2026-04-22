import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('text-sm', 'font-medium')).toBe('text-sm font-medium');
  });

  it('ignores falsy values', () => {
    expect(cn('text-sm', false, null, undefined, '', 'font-medium')).toBe('text-sm font-medium');
  });

  it('supports conditional objects (clsx)', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('deduplicates conflicting Tailwind utilities via twMerge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('flattens array inputs', () => {
    expect(cn(['text-sm', ['font-medium', 'leading-tight']])).toBe(
      'text-sm font-medium leading-tight',
    );
  });
});
