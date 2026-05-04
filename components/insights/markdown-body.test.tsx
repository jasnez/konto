import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownBody } from './markdown-body';

describe('MarkdownBody', () => {
  it('renders plain text unchanged', () => {
    render(<MarkdownBody>Bez ikakvog formatiranja.</MarkdownBody>);
    expect(screen.getByText('Bez ikakvog formatiranja.')).toBeInTheDocument();
  });

  it('renders **bold** as <strong>', () => {
    render(<MarkdownBody>Ovo je **važno** za korisnika.</MarkdownBody>);
    const strong = screen.getByText('važno');
    expect(strong.tagName).toBe('STRONG');
    expect(strong).toHaveClass('font-semibold');
  });

  it('renders multiple bold segments', () => {
    render(<MarkdownBody>**Hrana** je u **aprilu** bila viša.</MarkdownBody>);
    expect(screen.getByText('Hrana').tagName).toBe('STRONG');
    expect(screen.getByText('aprilu').tagName).toBe('STRONG');
  });

  it('renders raw HTML in body as text (XSS-safe)', () => {
    render(<MarkdownBody>{'<script>alert(1)</script>'}</MarkdownBody>);
    // React escapes; the literal text appears, no <script> element exists.
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('preserves newlines via whitespace-pre-line', () => {
    const { container } = render(
      <MarkdownBody>{'Prvi red.\nDrugi red.'}</MarkdownBody>,
    );
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.className).toContain('whitespace-pre-line');
    expect(p?.textContent).toContain('Prvi red.');
    expect(p?.textContent).toContain('Drugi red.');
  });

  it('handles empty body without crashing', () => {
    const { container } = render(<MarkdownBody>{''}</MarkdownBody>);
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('accepts a custom className override', () => {
    const { container } = render(
      <MarkdownBody className="text-xs text-emerald-600">Ok.</MarkdownBody>,
    );
    expect(container.querySelector('p')?.className).toContain('text-emerald-600');
  });
});
