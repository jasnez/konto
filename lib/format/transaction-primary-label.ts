/**
 * Primary line label for transaction lists (merchant / opis / transfer).
 * Order: linked merchant → merchant_raw → description → transfer fallback → "Bez opisa".
 */
export interface TransactionPrimaryLabelInput {
  merchant_display_name: string | null | undefined;
  merchant_raw: string | null;
  description: string | null;
  is_transfer: boolean;
  /** Signed amount on this ledger line (minor units); used only for transfer arrow direction. */
  original_amount_cents: number | bigint;
  account_name: string | null;
  /** Resolved from transfer_pair_id → sibling row's account name, if any. */
  transfer_counterparty_account_name: string | null;
}

export function getTransactionPrimaryLabel(input: TransactionPrimaryLabelInput): string {
  const fromMerchant = input.merchant_display_name?.trim();
  if (fromMerchant) return fromMerchant;

  const fromRaw = input.merchant_raw?.trim();
  if (fromRaw) return fromRaw;

  const fromDescription = input.description?.trim();
  if (fromDescription) return fromDescription;

  if (input.is_transfer) {
    const selfTrim = input.account_name?.trim() ?? '';
    const self = selfTrim.length > 0 ? selfTrim : 'Račun';
    const other = input.transfer_counterparty_account_name?.trim();
    if (other && other.length > 0) {
      const amount =
        typeof input.original_amount_cents === 'bigint'
          ? input.original_amount_cents
          : BigInt(input.original_amount_cents);
      if (amount < 0n) return `Transfer: ${self} → ${other}`;
      if (amount > 0n) return `Transfer: ${other} → ${self}`;
      return `Transfer: ${self} · ${other}`;
    }
    return 'Transfer';
  }

  return 'Bez opisa';
}
