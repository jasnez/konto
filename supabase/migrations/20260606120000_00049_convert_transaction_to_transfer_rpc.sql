-- 00049: convert_transaction_to_transfer RPC.
--
-- A user records something as Income or Expense and only later realizes it
-- was actually a Transfer between two of their accounts (most common case
-- in practice: a loan instalment recorded as Prihod on the loan account,
-- the original audit bug behind P3). Until now the only way out was
-- delete-then-create-as-transfer manually, with no atomicity.
--
-- This RPC does the conversion in one transaction:
--   1. Validates ownership of the source transaction and the counterparty
--      account, and that the two accounts differ.
--   2. Determines transfer direction from the original amount sign:
--        - amount > 0 (income on account A) → from=counterparty, to=A
--          (money "came from" the counterparty into A)
--        - amount < 0 (expense from account A) → from=A, to=counterparty
--          (money "went to" the counterparty out of A)
--   3. Soft-deletes the original row (sets deleted_at = now()), so it can
--      still be restored via the existing restore mechanism if the user
--      changes their mind.
--   4. Inserts a fresh transfer pair (paired via transfer_pair_id) with
--      the same date and amount magnitude. Notes are carried over as a
--      best-effort breadcrumb. Merchant / category / tags are intentionally
--      dropped — they were captured under the wrong premise (transfers
--      don't have a payee or category in this app's model).
--
-- Currency: only same-currency conversions are supported in this RPC. If
-- the source transaction's currency differs from the counterparty
-- account's currency, the function raises CROSS_CURRENCY_NOT_SUPPORTED so
-- the UI can fall back to the regular transfer-creation flow (where the
-- user enters the converted amount explicitly). This avoids guessing FX
-- rates retroactively.
--
-- Pattern matches create_transfer_pair (00041): SECURITY DEFINER, since
-- the soft-delete + paired inserts cross RLS-checked rows that don't all
-- exist mid-transaction.

create or replace function public.convert_transaction_to_transfer(
  p_transaction_id          uuid,
  p_counterparty_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id           uuid := auth.uid();
  v_original          public.transactions%rowtype;
  v_counterparty_curr text;
  v_abs_amount        bigint;
  v_abs_base          bigint;
  v_from_account_id   uuid;
  v_to_account_id     uuid;
  v_from_id           uuid := gen_random_uuid();
  v_to_id             uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Read original transaction. Must belong to the caller and not be deleted
  -- or already a transfer leg.
  select * into v_original
  from public.transactions
  where id = p_transaction_id
    and user_id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_original.is_transfer then
    raise exception 'ALREADY_TRANSFER';
  end if;

  if v_original.original_amount_cents = 0 then
    raise exception 'ZERO_AMOUNT';
  end if;

  -- Counterparty must be a different, owned account.
  if p_counterparty_account_id = v_original.account_id then
    raise exception 'SAME_ACCOUNT';
  end if;

  select currency into v_counterparty_curr
  from public.accounts
  where id = p_counterparty_account_id
    and user_id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception 'FORBIDDEN: counterparty';
  end if;

  -- Same-currency conversions only — see header comment.
  if upper(v_counterparty_curr) <> upper(v_original.original_currency) then
    raise exception 'CROSS_CURRENCY_NOT_SUPPORTED';
  end if;

  -- Direction from amount sign.
  v_abs_amount := abs(v_original.original_amount_cents);
  v_abs_base   := abs(v_original.base_amount_cents);

  if v_original.original_amount_cents > 0 then
    -- Income on original.account_id — counterparty is the FROM (where the
    -- money came from), original.account_id is the TO.
    v_from_account_id := p_counterparty_account_id;
    v_to_account_id   := v_original.account_id;
  else
    -- Expense from original.account_id — original.account_id is the FROM,
    -- counterparty is the TO.
    v_from_account_id := v_original.account_id;
    v_to_account_id   := p_counterparty_account_id;
  end if;

  -- Soft-delete the original row first so the user's transaction list
  -- doesn't briefly show three rows during the swap.
  update public.transactions
  set deleted_at = now()
  where id = p_transaction_id;

  -- FROM leg (negative amount — money leaving).
  insert into public.transactions (
    id,
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    account_ledger_cents,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer,
    transfer_pair_id
  ) values (
    v_from_id,
    v_user_id,
    v_from_account_id,
    -v_abs_amount,
    v_original.original_currency,
    -v_abs_base,
    v_original.base_currency,
    -v_abs_amount,
    v_original.fx_rate,
    v_original.fx_rate_date,
    v_original.fx_stale,
    v_original.transaction_date,
    v_original.notes,
    'manual',
    true,
    v_to_id
  );

  -- TO leg (positive amount — money arriving).
  insert into public.transactions (
    id,
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    account_ledger_cents,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer,
    transfer_pair_id
  ) values (
    v_to_id,
    v_user_id,
    v_to_account_id,
    v_abs_amount,
    v_original.original_currency,
    v_abs_base,
    v_original.base_currency,
    v_abs_amount,
    v_original.fx_rate,
    v_original.fx_rate_date,
    v_original.fx_stale,
    v_original.transaction_date,
    v_original.notes,
    'manual',
    true,
    v_from_id
  );

  return jsonb_build_object(
    'from_id', v_from_id,
    'to_id', v_to_id,
    'deleted_id', p_transaction_id
  );
end;
$$;

grant execute on function public.convert_transaction_to_transfer(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
