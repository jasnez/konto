import { describe, expect, it } from 'vitest';
import { getTransactionPrimaryLabel } from './transaction-primary-label';

const base = {
  merchant_display_name: null as string | null | undefined,
  merchant_raw: null as string | null,
  description: null as string | null,
  is_transfer: false,
  original_amount_cents: 0,
  account_name: 'Tekući',
  transfer_counterparty_account_name: null as string | null,
};

describe('getTransactionPrimaryLabel', () => {
  it('prefers linked merchant display name', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        merchant_display_name: '  Konzum  ',
        merchant_raw: 'konzum',
        description: 'Početno stanje',
      }),
    ).toBe('Konzum');
  });

  it('falls back to merchant_raw then description', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        merchant_raw: null,
        description: 'Početno stanje',
      }),
    ).toBe('Početno stanje');
  });

  it('uses transfer with arrow when counterparty is known (outgoing)', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        is_transfer: true,
        original_amount_cents: -1000,
        account_name: 'Tekući',
        transfer_counterparty_account_name: 'Štednja',
      }),
    ).toBe('Transfer: Tekući → Štednja');
  });

  it('uses transfer with arrow when counterparty is known (incoming)', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        is_transfer: true,
        original_amount_cents: 1000,
        account_name: 'Štednja',
        transfer_counterparty_account_name: 'Tekući',
      }),
    ).toBe('Transfer: Tekući → Štednja');
  });

  it('uses plain Transfer when is_transfer but no counterparty', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        is_transfer: true,
        transfer_counterparty_account_name: null,
      }),
    ).toBe('Transfer');
  });

  it('uses Bez opisa for non-transfer without any text fields', () => {
    expect(
      getTransactionPrimaryLabel({
        ...base,
        merchant_raw: '   ',
        description: null,
      }),
    ).toBe('Bez opisa');
  });
});
