import { describe, expect, it } from 'vitest';

import { redactPII } from '../redact-pii';

describe('redactPII', () => {
  it('redactuje IBAN (BA format)', () => {
    const input = 'Uplata na BA39 1290 0794 0102 8494 izvrsena.';
    const out = redactPII(input);

    expect(out).toContain('[IBAN-REDACTED]');
    expect(out).not.toContain('BA39 1290 0794 0102 8494');
  });

  it('redactuje PAN i ostavlja zadnje 4 cifre', () => {
    const input = 'Kartica: 4111 1111 1111 1111';
    const out = redactPII(input);

    expect(out).toContain('****1111');
    expect(out).not.toContain('4111 1111 1111 1111');
  });

  it('ne dira 16-cifreni broj koji nije Luhn validan', () => {
    const input = 'Interni broj: 1234 5678 9012 3456';
    const out = redactPII(input);

    expect(out).toContain('1234 5678 9012 3456');
  });

  it('redactuje JMBG od 13 cifara', () => {
    const input = 'JMBG: 0101993500006';
    const out = redactPII(input);

    expect(out).toContain('[JMBG-REDACTED]');
    expect(out).not.toContain('0101993500006');
  });

  it('ostavlja obican tekst netaknut', () => {
    const input = 'Kupovina u marketu 42.50 BAM, kategorija Hrana.';
    const out = redactPII(input);

    expect(out).toBe(input);
  });

  it('podrzava IBAN prefikse BA, HR, SI, RS, ME, MK', () => {
    const input =
      'BA39 1290 0794 0102 8494 | HR12 1001 0051 8630 0016 0 | SI56 1910 0000 0123 438 | RS35 2600 0560 1001 6113 79 | ME25 5050 0001 2345 6789 51 | MK07 2501 2000 0058 984';
    const out = redactPII(input);

    expect(out).toBe(
      '[IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED]',
    );
  });
});
