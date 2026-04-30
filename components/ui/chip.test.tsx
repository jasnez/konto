import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chip } from './chip';

describe('Chip', () => {
  describe('variant resolution', () => {
    it('renders default variant when neither variant nor active is set', () => {
      render(<Chip>Click</Chip>);
      const btn = screen.getByRole('button', { name: 'Click' });
      // default variant uses border-input bg-background
      expect(btn.className).toContain('bg-background');
      expect(btn.className).not.toContain('bg-primary');
    });

    it('applies active variant via active={true} shorthand', () => {
      render(<Chip active>Click</Chip>);
      const btn = screen.getByRole('button', { name: 'Click' });
      expect(btn.className).toContain('bg-primary');
      expect(btn.className).toContain('text-primary-foreground');
    });

    it('explicit variant="active" wins over active={false}', () => {
      // Edge case: caller wants the active visual without using the shorthand
      render(
        <Chip variant="active" active={false}>
          Click
        </Chip>,
      );
      const btn = screen.getByRole('button', { name: 'Click' });
      expect(btn.className).toContain('bg-primary');
    });

    it('removable variant ignores active={true} — non-default variants take precedence', () => {
      // This is the P0.3 fix: previously `active` was silently dropped; now
      // the precedence is explicit and documented.
      render(
        <Chip variant="removable" active>
          Tag
        </Chip>,
      );
      const btn = screen.getByRole('button', { name: 'Tag' });
      // removable uses bg-secondary, NOT bg-primary
      expect(btn.className).toContain('bg-secondary');
      expect(btn.className).not.toContain('bg-primary');
    });

    it('removable variant without active renders correctly', () => {
      render(<Chip variant="removable">Tag</Chip>);
      const btn = screen.getByRole('button', { name: 'Tag' });
      expect(btn.className).toContain('bg-secondary');
    });
  });

  describe('default props', () => {
    it('defaults type to "button" so it does not submit forms', () => {
      render(<Chip>Click</Chip>);
      const btn = screen.getByRole('button', { name: 'Click' });
      expect(btn).toHaveAttribute('type', 'button');
    });

    it('passes through custom type when provided', () => {
      render(<Chip type="submit">Submit</Chip>);
      const btn = screen.getByRole('button', { name: 'Submit' });
      expect(btn).toHaveAttribute('type', 'submit');
    });
  });

  describe('sizes', () => {
    it('applies size="default" classes', () => {
      render(<Chip>X</Chip>);
      const btn = screen.getByRole('button', { name: 'X' });
      expect(btn.className).toContain('h-9');
      expect(btn.className).toContain('px-3');
    });

    it('applies size="sm" classes', () => {
      render(<Chip size="sm">X</Chip>);
      const btn = screen.getByRole('button', { name: 'X' });
      expect(btn.className).toContain('h-7');
      expect(btn.className).toContain('px-2.5');
    });
  });

  describe('a11y / focus', () => {
    it('always includes focus-visible ring classes', () => {
      render(<Chip>X</Chip>);
      const btn = screen.getByRole('button', { name: 'X' });
      expect(btn.className).toContain('focus-visible:ring-2');
      expect(btn.className).toContain('focus-visible:ring-ring');
    });

    it('passes aria-pressed through to the rendered button', () => {
      render(
        <Chip active aria-pressed>
          Toggle
        </Chip>,
      );
      const btn = screen.getByRole('button', { name: 'Toggle' });
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('disabled state', () => {
    it('applies disabled styles via Tailwind', () => {
      render(<Chip disabled>X</Chip>);
      const btn = screen.getByRole('button', { name: 'X' });
      expect(btn).toBeDisabled();
      expect(btn.className).toContain('disabled:opacity-50');
    });
  });
});
