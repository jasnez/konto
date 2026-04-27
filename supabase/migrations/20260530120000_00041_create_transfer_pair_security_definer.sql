-- DL-2 fix: change create_transfer_pair to SECURITY DEFINER.
--
-- The SECURITY INVOKER variant fails at the first INSERT because the RLS
-- INSERT policy checks `user_owns_transaction(transfer_pair_id)`, but the
-- partner row doesn't exist yet when the first leg is written. The function
-- already validates account ownership explicitly before touching any rows, so
-- bypassing RLS here is safe.

create or replace function public.create_transfer_pair(
  p_from_account_id    uuid,
  p_to_account_id      uuid,
  p_from_amount_cents  bigint,
  p_to_amount_cents    bigint,
  p_from_currency      text,
  p_to_currency        text,
  p_from_base_cents    bigint,
  p_to_base_cents      bigint,
  p_base_currency      text,
  p_from_fx_rate       numeric(20,10),
  p_to_fx_rate         numeric(20,10),
  p_from_fx_rate_date  date,
  p_to_fx_rate_date    date,
  p_from_fx_stale      boolean,
  p_to_fx_stale        boolean,
  p_transaction_date   date,
  p_notes              text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_from_id  uuid := gen_random_uuid();
  v_to_id    uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'INVALID: from and to accounts must differ';
  end if;

  if not exists (
    select 1 from public.accounts
    where id = p_from_account_id and user_id = v_user_id and deleted_at is null
  ) then
    raise exception 'FORBIDDEN: from_account';
  end if;

  if not exists (
    select 1 from public.accounts
    where id = p_to_account_id and user_id = v_user_id and deleted_at is null
  ) then
    raise exception 'FORBIDDEN: to_account';
  end if;

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
    p_from_account_id,
    p_from_amount_cents,
    p_from_currency,
    p_from_base_cents,
    p_base_currency,
    p_from_amount_cents,
    p_from_fx_rate,
    p_from_fx_rate_date,
    p_from_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true,
    v_to_id
  );

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
    p_to_account_id,
    p_to_amount_cents,
    p_to_currency,
    p_to_base_cents,
    p_base_currency,
    p_to_amount_cents,
    p_to_fx_rate,
    p_to_fx_rate_date,
    p_to_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true,
    v_from_id
  );

  return jsonb_build_object('from_id', v_from_id, 'to_id', v_to_id);
end;
$$;

notify pgrst, 'reload schema';
