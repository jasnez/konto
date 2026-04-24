import { format } from 'date-fns';
import { bs } from 'date-fns/locale';
import type { z } from 'zod';
import type { AccountOption } from '@/components/account-select';
import type { CategoryOption, TransactionKind } from '@/components/category-select';
import type { CreateTransactionSchema } from '@/lib/schemas/transaction';

// Pure helpers + draft persistence for QuickAddTransaction. Kept in a
// sibling module so the component file focuses on render logic. Every
// export here is either pure (deterministic given args) or only touches
// window.localStorage behind try/catch (private mode / SSR safe).

export const LAST_USED_STORAGE_KEY = 'konto:quick-add:last-used';

export type QuickAddFormValues = z.infer<typeof CreateTransactionSchema>;

export interface LastUsedValues {
  account_id: string | null;
  category_id: string | null;
  merchant_raw: string | null;
  kind: TransactionKind;
}

export interface RetryDraft {
  values: QuickAddFormValues;
  kind: TransactionKind;
}

export function getTodayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd', { locale: bs });
}

export function normalizeAmountForKind(amountCents: bigint, kind: TransactionKind): bigint {
  const abs = amountCents < 0n ? -amountCents : amountCents;
  return kind === 'income' ? abs : -abs;
}

export function toCanonicalMerchant(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function readLastUsed(): LastUsedValues | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_USED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;

    const maybePayload = parsed as Partial<LastUsedValues>;
    if (
      maybePayload.kind !== 'expense' &&
      maybePayload.kind !== 'income' &&
      maybePayload.kind !== 'transfer'
    ) {
      return null;
    }

    return {
      account_id: maybePayload.account_id ?? null,
      category_id: maybePayload.category_id ?? null,
      merchant_raw: maybePayload.merchant_raw ?? null,
      kind: maybePayload.kind,
    };
  } catch {
    return null;
  }
}

export function writeLastUsed(payload: LastUsedValues): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_USED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can be blocked in private mode.
  }
}

export function buildDefaults(
  accounts: AccountOption[],
  categories: CategoryOption[],
  fallbackKind: TransactionKind,
): { values: QuickAddFormValues; kind: TransactionKind } {
  const today = getTodayIsoDate();
  const lastUsed = readLastUsed();
  const firstAccountId = accounts.at(0)?.id ?? '';
  const accountId =
    lastUsed?.account_id && accounts.some((account) => account.id === lastUsed.account_id)
      ? lastUsed.account_id
      : firstAccountId;
  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? 'BAM';
  const kind = lastUsed?.kind ?? fallbackKind;
  const categoryId =
    (lastUsed?.category_id && categories.some((category) => category.id === lastUsed.category_id)
      ? lastUsed.category_id
      : null) ?? null;

  return {
    kind,
    values: {
      account_id: accountId,
      to_account_id: undefined,
      amount_cents: normalizeAmountForKind(0n, kind),
      currency: accountCurrency,
      transaction_date: today,
      merchant_raw: lastUsed?.merchant_raw ?? null,
      merchant_id: null,
      category_id: categoryId,
      notes: null,
    },
  };
}
