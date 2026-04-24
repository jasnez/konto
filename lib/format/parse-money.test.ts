import { describe, it, expect } from 'vitest';
import { parseMoneyString } from './parse-money';

describe('parseMoneyString', () => {
  it('parses integer', () => {
    expect(parseMoneyString('1234', 'bs-BA')).toBe(BigInt(123400));
  });

  it('parses with decimal comma (bs-BA)', () => {
    expect(parseMoneyString('12,50', 'bs-BA')).toBe(BigInt(1250));
  });

  it('parses with decimal period (en-US)', () => {
    expect(parseMoneyString('12.50', 'en-US')).toBe(BigInt(1250));
  });

  it('parses with thousands separator (bs-BA)', () => {
    expect(parseMoneyString('1.234,50', 'bs-BA')).toBe(BigInt(123450));
  });

  it('parses negative', () => {
    expect(parseMoneyString('-12,50', 'bs-BA')).toBe(BigInt(-1250));
  });

  it('handles Unicode minus', () => {
    expect(parseMoneyString('−12,50', 'bs-BA')).toBe(BigInt(-1250));
  });

  it('returns null for invalid input', () => {
    expect(parseMoneyString('abc', 'bs-BA')).toBeNull();
    expect(parseMoneyString('', 'bs-BA')).toBeNull();
    expect(parseMoneyString('12,50,30', 'bs-BA')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseMoneyString('  12,50  ', 'bs-BA')).toBe(BigInt(1250));
    expect(parseMoneyString('12 .50', 'bs-BA')).toBeNull();
  });

  it('handles single decimal', () => {
    expect(parseMoneyString('12,5', 'bs-BA')).toBe(BigInt(1250));
  });

  it('handles three decimals (error)', () => {
    expect(parseMoneyString('12,501', 'bs-BA')).toBeNull();
  });

  it('handles zero', () => {
    expect(parseMoneyString('0', 'bs-BA')).toBe(BigInt(0));
    expect(parseMoneyString('0,00', 'bs-BA')).toBe(BigInt(0));
  });

  it('accepts leading minus for zero amounts', () => {
    expect(parseMoneyString('-0', 'bs-BA')).toBe(BigInt(0));
    expect(parseMoneyString('-0,00', 'bs-BA')).toBe(BigInt(0));
    expect(parseMoneyString('−0,00', 'bs-BA')).toBe(BigInt(0));
  });

  it('handles large numbers', () => {
    expect(parseMoneyString('1.234.567,89', 'bs-BA')).toBe(BigInt(123456789));
  });
});
