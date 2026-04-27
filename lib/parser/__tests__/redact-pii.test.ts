import { describe, expect, it } from 'vitest';

import { redactPII } from '../redact-pii';

describe('redactPII — IBAN', () => {
  it('redactuje BA IBAN', () => {
    const out = redactPII('Uplata na BA39 1290 0794 0102 8494 izvrsena.');
    expect(out).toContain('[IBAN-REDACTED]');
    expect(out).not.toContain('BA39 1290 0794 0102 8494');
  });

  it('redactuje sve regione ex-YU + SI', () => {
    const input =
      'BA39 1290 0794 0102 8494 | HR12 1001 0051 8630 0016 0 | SI56 1910 0000 0123 438 | RS35 2600 0560 1001 6113 79 | ME25 5050 0001 2345 6789 51 | MK07 2501 2000 0058 984';
    const out = redactPII(input);
    expect(out).toBe(
      '[IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED] | [IBAN-REDACTED]',
    );
  });

  it('redactuje non-BiH IBAN — DE (Njemačka)', () => {
    const out = redactPII('Transfer sa DE89 3704 0044 0532 0130 00.');
    expect(out).toContain('[IBAN-REDACTED]');
    expect(out).not.toContain('DE89');
  });

  it('redactuje non-BiH IBAN — AT (Austrija)', () => {
    const out = redactPII('Račun: AT61 1904 3002 3457 3201');
    expect(out).toContain('[IBAN-REDACTED]');
  });

  it('redactuje non-BiH IBAN — GB (UK)', () => {
    const out = redactPII('GB29 NWBK 6016 1331 9268 19');
    expect(out).toContain('[IBAN-REDACTED]');
    expect(out).not.toContain('GB29');
  });
});

describe('redactPII — PAN', () => {
  it('redactuje PAN i ostavlja zadnje 4 cifre', () => {
    const out = redactPII('Kartica: 4111 1111 1111 1111');
    expect(out).toContain('****1111');
    expect(out).not.toContain('4111 1111 1111 1111');
  });

  it('ne dira 16-cifreni broj koji nije Luhn validan', () => {
    const out = redactPII('Interni broj: 1234 5678 9012 3456');
    expect(out).toContain('1234 5678 9012 3456');
  });
});

describe('redactPII — JMBG', () => {
  it('redactuje JMBG od 13 cifara', () => {
    const out = redactPII('JMBG: 0101993500006');
    expect(out).toContain('[JMBG-REDACTED]');
    expect(out).not.toContain('0101993500006');
  });
});

describe('redactPII — email', () => {
  it('redactuje email adresu', () => {
    const out = redactPII('Kontakt: korisnik@example.com za više info.');
    expect(out).toContain('[EMAIL-REDACTED]');
    expect(out).not.toContain('korisnik@example.com');
  });

  it('redactuje email sa subdomain-om', () => {
    const out = redactPII('Pošalji na ime.prezime@mail.banka.ba');
    expect(out).toContain('[EMAIL-REDACTED]');
  });

  it('ne dira tekst koji nije email', () => {
    const out = redactPII('Iznos 42.50 BAM, ref v2.0/transaction');
    expect(out).toBe('Iznos 42.50 BAM, ref v2.0/transaction');
  });

  it('redactuje više email adresa u tekstu', () => {
    const out = redactPII('Od: a@b.com do: c@d.org');
    expect(out).not.toContain('@');
    expect(out.match(/\[EMAIL-REDACTED\]/g)).toHaveLength(2);
  });
});

describe('redactPII — telefon', () => {
  it('redactuje BiH broj u domaćem formatu', () => {
    const out = redactPII('Tel: 061 234 567 za kontakt.');
    expect(out).toContain('[PHONE-REDACTED]');
    expect(out).not.toContain('061 234 567');
  });

  it('redactuje međunarodni broj s prefiksom +387', () => {
    const out = redactPII('Pozovite +387 61 234 567');
    expect(out).toContain('[PHONE-REDACTED]');
    expect(out).not.toContain('+387');
  });

  it('redactuje međunarodni broj s prefiksom +49 (Njemačka)', () => {
    const out = redactPII('Kontakt u Beču: +49 30 1234567');
    expect(out).toContain('[PHONE-REDACTED]');
  });

  it('ne dira kratke brojeve koji nisu telefonski (npr. iznos 061.50)', () => {
    // "061.50" should not be treated as a phone number
    const out = redactPII('Iznos: 061.50 BAM');
    expect(out).not.toContain('[PHONE-REDACTED]');
  });
});

describe('redactPII — kombinovani slučajevi', () => {
  it('redactuje IBAN, email i telefon u jednom tekstu', () => {
    const input =
      'Primalac: BA39 1290 0794 0102 8494, kontakt: korisnik@banka.ba, tel: +387 33 123 456';
    const out = redactPII(input);
    expect(out).toContain('[IBAN-REDACTED]');
    expect(out).toContain('[EMAIL-REDACTED]');
    expect(out).toContain('[PHONE-REDACTED]');
    expect(out).not.toContain('BA39');
    expect(out).not.toContain('@');
    expect(out).not.toContain('+387');
  });

  it('ostavlja obican tekst netaknut', () => {
    const input = 'Kupovina u marketu 42.50 BAM, kategorija Hrana.';
    expect(redactPII(input)).toBe(input);
  });
});
