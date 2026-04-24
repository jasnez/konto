import { describe, it, expect } from 'vitest';
import { ExtractedReceiptSchema, emptyExtractedReceipt, isSupportedCurrency } from './receipt';

describe('ExtractedReceiptSchema', () => {
  it('accepts a well-formed Gemini payload for BAM receipt', () => {
    const payload = {
      total_amount: 45.89,
      currency: 'BAM',
      date: '2026-03-15',
      merchant_name: 'Konzum d.o.o.',
      items: [
        { name: 'Hljeb', quantity: 2, unit_price: 1.2, total: 2.4 },
        { name: 'Mlijeko', total: 2.89 },
      ],
      tax_amount: 7.02,
      confidence: 0.92,
    };
    const parsed = ExtractedReceiptSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.total_amount).toBe(45.89);
    expect(parsed.data.currency).toBe('BAM');
    expect(parsed.data.items.length).toBe(2);
  });

  it('uppercases the currency code automatically', () => {
    const parsed = ExtractedReceiptSchema.safeParse({
      total_amount: 10,
      currency: 'eur',
      date: '2026-01-01',
      merchant_name: 'Shop',
      items: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.currency).toBe('EUR');
  });

  it('rejects payload with invalid date format', () => {
    const parsed = ExtractedReceiptSchema.safeParse({
      total_amount: 10,
      currency: 'BAM',
      date: '15.03.2026',
      merchant_name: 'X',
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects payload with non-numeric total_amount', () => {
    const parsed = ExtractedReceiptSchema.safeParse({
      total_amount: '45,89',
      currency: 'BAM',
      date: '2026-03-15',
      merchant_name: 'Konzum',
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts all-null payload with empty items (low-confidence fallback)', () => {
    const parsed = ExtractedReceiptSchema.safeParse({
      total_amount: null,
      currency: null,
      date: null,
      merchant_name: null,
      items: [],
      tax_amount: null,
      confidence: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects currency code of wrong length', () => {
    const parsed = ExtractedReceiptSchema.safeParse({
      total_amount: 10,
      currency: 'KM',
      date: '2026-01-01',
      merchant_name: 'X',
      items: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('emptyExtractedReceipt', () => {
  it('returns a Zod-valid empty payload', () => {
    const empty = emptyExtractedReceipt();
    const parsed = ExtractedReceiptSchema.safeParse(empty);
    expect(parsed.success).toBe(true);
  });
});

describe('isSupportedCurrency', () => {
  it.each<[string | null, boolean]>([
    ['BAM', true],
    ['bam', true],
    ['eur', true],
    ['usd', true],
    ['XYZ', false],
    ['', false],
    [null, false],
  ])('%s → %s', (input, expected) => {
    expect(isSupportedCurrency(input)).toBe(expected);
  });
});
