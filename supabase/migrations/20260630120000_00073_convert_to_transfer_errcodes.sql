-- TR-1 + TR-2: Hardening of `convert_transaction_to_transfer` RPC.
--
-- Replaces the function defined in migration 00049 with two changes:
--
-- TR-1 — explicit SQLSTATE errcodes per error type. Previously the RPC
-- raised `raise exception '<TYPE_STRING>'` and the TS action matched on
-- `error.message.includes('<TYPE_STRING>')`. That is brittle: any future
-- edit to the message text (e.g. "Transaction not found" instead of
-- "NOT_FOUND") silently breaks the mapping and collapses to
-- DATABASE_ERROR. Each `raise exception` now carries a unique 5-char
-- SQLSTATE in class `KX` (Konto eXception). The TS action matches on
-- `error.code` instead of message text.
--
-- KX is a user-defined class — PostgreSQL reserves classes starting with
-- digits 5-9 and letters I-Z for application use (manual §60.1).
--
--   KX001  UNAUTHORIZED                  — auth.uid() returned null
--   KX002  NOT_FOUND                     — original tx not found / not owned
--   KX003  ALREADY_TRANSFER              — original is already a transfer leg
--   KX004  ZERO_AMOUNT                   — original.original_amount_cents = 0
--   KX005  SAME_ACCOUNT                  — counterparty == original.account_id
--   KX006  COUNTERPARTY_NOT_FOUND        — counterparty not owned (was 'FORBIDDEN: counterparty')
--   KX007  CROSS_CURRENCY_NOT_SUPPORTED  — currency mismatch
--
-- TR-2 — `for update` lock on the original row SELECT. Without it, two
-- concurrent calls (e.g. simultaneous double-click before the UI's
-- `disabled` state catches up, or a network-retry race) could both pass
-- the "not deleted" check, both UPDATE the deleted_at, and both INSERT
-- a fresh transfer pair → 4 rows / 2 pairs / corrupted ledger. The lock
-- serialises concurrent calls; the second one sees `deleted_at IS NOT
-- NULL` after the first commits and raises NOT_FOUND. UI button stays
-- the primary defence (it's `disabled` while the action is pending);
-- this is defence-in-depth at the DB layer.
--
-- Idempotency note: this RPC is NOT idempotent across network retries
-- in the sense of "return the existing transfer pair on retry". A
-- network failure mid-call followed by a manual user retry will return
-- NOT_FOUND on the second call (because the original is now soft-
-- deleted) — the conversion DID succeed but the user sees an error
-- toast. The audit's recommended idempotency-key implementation
-- (separate column linking original → transfer-pair) was scoped out
-- as over-engineering for the current risk profile; the UI flow does
-- not auto-retry. Document in PR.

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
    raise exception 'UNAUTHORIZED' using errcode = 'KX001';
  end if;

  -- TR-2: `for update` locks the original row so two concurrent calls
  -- serialise. The second call after the first commits sees the row's
  -- `deleted_at` and raises NOT_FOUND (no double-create).
  select * into v_original
  from public.transactions
  where id = p_transaction_id
    and user_id = v_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'KX002';
  end if;

  if v_original.is_transfer then
    raise exception 'ALREADY_TRANSFER' using errcode = 'KX003';
  end if;

  if v_original.original_amount_cents = 0 then
    raise exception 'ZERO_AMOUNT' using errcode = 'KX004';
  end if;

  -- Counterparty must be a different, owned account.
  if p_counterparty_account_id = v_original.account_id then
    raise exception 'SAME_ACCOUNT' using errcode = 'KX005';
  end if;

  select currency into v_counterparty_curr
  from public.accounts
  where id = p_counterparty_account_id
    and user_id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception 'COUNTERPARTY_NOT_FOUND' using errcode = 'KX006';
  end if;

  -- Same-currency conversions only — see migration 00049 header.
  if upper(v_counterparty_curr) <> upper(v_original.original_currency) then
    raise exception 'CROSS_CURRENCY_NOT_SUPPORTED' using errcode = 'KX007';
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

-- Grants are inherited from migration 00049's GRANT EXECUTE TO authenticated.
-- CREATE OR REPLACE preserves them (does not reset). Per per-role REVOKE
-- pattern (feedback_supabase_function_revokes.md) we don't need to
-- re-grant — Supabase's auto-grants on REPLACE keep anon/authenticated/
-- service_role intact, and authenticated is the intended caller.

notify pgrst, 'reload schema';
