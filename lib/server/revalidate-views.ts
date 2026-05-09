import { revalidatePath } from 'next/cache';

/**
 * Standard revalidation for any Server Action that writes (insert/update/
 * delete) to the `transactions` table. Affected views:
 *
 *  - `/pocetna`     — dashboard hero (balance), recent-tx widget, monthly
 *                     summary metrics
 *  - `/transakcije` — main list
 *  - `/racuni`      — accounts list (each row shows `current_balance_cents`
 *                     plus the latest transaction)
 *  - `/racuni/{id}` — per-account detail (last 50 txs + balance)
 *
 * Centralised so callers can't accidentally drop one. The original sin
 * here was `revalidatePath('/')` in `skeniraj/actions.ts`, which never
 * matched the dashboard's `/pocetna` route — see audit 2026-05-08. Two
 * other callers had grown their own near-duplicate inline blocks; this
 * helper consolidates them.
 *
 * Pass every `account_id` that the write touched. Transfers touch two
 * accounts; pass both so each account's detail page revalidates.
 *
 * The accompanying test (`__tests__/lib/server/revalidate-views.test.ts`)
 * snapshots the exact path list — any change to the routes above MUST
 * update that test, which forces explicit acknowledgement during code
 * review.
 */
export function revalidateAfterTransactionWrite(accountIds: readonly string[]): void {
  revalidatePath('/transakcije');
  revalidatePath('/pocetna');
  revalidatePath('/racuni');
  for (const accountId of new Set(accountIds)) {
    revalidatePath(`/racuni/${accountId}`);
  }
}
