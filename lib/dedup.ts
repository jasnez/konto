import crypto from 'node:crypto';

interface DedupHashInput {
  account_id: string;
  amount_cents: bigint;
  date: string;
  merchant: string | null;
}

export function computeDedupHash(input: DedupHashInput): string {
  const normalized = [
    input.account_id,
    input.amount_cents.toString(),
    input.date,
    (input.merchant ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
