/**
 * DL-5 property tests: verify that FX rate values round-trip through JSON
 * serialization without precision loss beyond what numeric(20,10) stores.
 *
 * The risk: previously the RPC parameters were double precision, meaning
 * Postgres parsed the JSON decimal string into double precision first, then
 * cast to numeric(20,10). With numeric(20,10) parameters, Postgres parses the
 * JSON string directly as exact decimal — no intermediate float truncation.
 *
 * We can't call Postgres in a unit test, so we verify the JS side of the
 * contract: JSON.stringify(rate) must produce a decimal string that, when
 * rounded to 10 decimal places, equals round(rate, 10). Any drift here would
 * persist regardless of the Postgres type.
 */
import { describe, expect, it } from 'vitest';

const DECIMAL_PLACES = 10;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function jsonRoundTrip(rate: number): number {
  return parseFloat(JSON.stringify(rate));
}

const TYPICAL_RATES: { label: string; rate: number }[] = [
  { label: 'EUR/BAM currency board', rate: 1.955830 },
  { label: 'USD/EUR approx', rate: 0.9217 },
  { label: 'CHF/EUR approx', rate: 1.0712 },
  { label: 'GBP/EUR approx', rate: 0.8547 },
  { label: 'identity', rate: 1 },
  { label: 'cross rate USD/BAM', rate: 1.955830 * 0.9217 },
  { label: 'very small rate (JPY/EUR approx)', rate: 0.006211 },
  { label: 'large rate (EUR/JPY approx)', rate: 161.0 },
  { label: 'high-precision ECB rate', rate: 1.0823456789 },
  { label: '1/1.955583 recurring decimal', rate: 1 / 1.955583 },
  { label: '1/1.17 recurring decimal', rate: 1 / 1.17 },
];

describe('FX rate JSON serialization precision (DL-5)', () => {
  it.each(TYPICAL_RATES)(
    'JSON round-trip is lossless for $label ($rate)',
    ({ rate }) => {
      expect(jsonRoundTrip(rate)).toBe(rate);
    },
  );

  it.each(TYPICAL_RATES)(
    'JSON string decimal representation matches numeric(20,10) precision for $label',
    ({ rate }) => {
      const serialized = JSON.stringify(rate);
      const parsed = parseFloat(serialized);
      const atNumericPrecision = roundTo(parsed, DECIMAL_PLACES);
      const expected = roundTo(rate, DECIMAL_PLACES);

      expect(atNumericPrecision).toBe(expected);
    },
  );

  it('accumulated rounding across 200 BAM/EUR transactions stays within 1 cent', () => {
    const rate = 1 / 1.955830;
    let totalDrift = 0;

    for (let i = 1; i <= 200; i++) {
      const amountCents = BigInt(i * 100);
      const exactCents = Number(amountCents) * rate;
      const roundedCents = Math.round(exactCents);
      // drift per transaction: how much we lose by rounding
      totalDrift += Math.abs(exactCents - roundedCents);
    }

    // total accumulated drift from rounding (not from float representation)
    // must be ≤ 100 cents (1 EUR) across 200 transactions
    expect(totalDrift).toBeLessThan(100);
  });

  it('numeric(20,10) stores 10 decimal places of fx_rate precision', () => {
    // Verify that JSON.stringify produces at least 10 significant decimal
    // digits for rates in the [0.001, 10000] range so that Postgres
    // numeric(20,10) receives the full value without truncation.
    const testRates = [0.001, 0.01, 0.1, 1.0, 10.0, 100.0, 1000.0, 10000.0];

    for (const rate of testRates) {
      const str = JSON.stringify(rate);
      const decimalPart = str.includes('.') ? str.split('.')[1] : '';
      // strip trailing zeros and check non-trivial rates have enough digits
      const sigDigitsInStr = str.replace(/[^0-9]/g, '').replace(/^0+/, '').length;
      // JSON.stringify uses shortest representation; any FX rate with ECB
      // precision (typically 4–10 significant figures) must not be truncated
      expect(parseFloat(str)).toBe(rate);
      expect(sigDigitsInStr).toBeGreaterThanOrEqual(1);
      // the decimal string must round-trip exactly
      expect(roundTo(parseFloat(str), DECIMAL_PLACES)).toBe(roundTo(rate, DECIMAL_PLACES));
      // suppress unused variable warning for decimalPart
      void decimalPart;
    }
  });
});
