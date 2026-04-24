-- Creates two linked transaction rows (debit + credit) for a transfer between
-- two of the authenticated user's accounts.  All FX data is pre-computed by the
-- application layer (lib/fx/convert.ts) and passed in as parameters.
--
-- Returns: { "from_id": "<uuid>", "to_id": "<uuid>" }

create or replace function public.create_transfer_pair(
  p_from_account_id    uuid,
  p_to_account_id      uuid,
  p_from_amount_cents  bigint,        -- negative (debit leg)
  p_to_amount_cents    bigint,        -- positive (credit leg)
  p_from_currency      text,
  p_to_currency        text,
  p_from_base_cents    bigint,
  p_to_base_cents      bigint,
  p_base_currency      text,
  p_from_fx_rate       double precision,
  p_to_fx_rate         double precision,
  p_from_fx_rate_date  date,
  p_to_fx_rate_date    date,
  p_from_fx_stale      boolean,
  p_to_fx_stale        boolean,
  p_transaction_date   date,
  p_notes              text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id  uuid := auth.uid();
  v_from_id  uuid;
  v_to_id    uuid;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'INVALID: from and to accounts must differ';
  end if;

  -- Both accounts must be owned by the calling user and not soft-deleted.
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

  -- Insert debit leg (money leaves the from-account).
  insert into public.transactions (
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer
  ) values (
    v_user_id,
    p_from_account_id,
    p_from_amount_cents,
    p_from_currency,
    p_from_base_cents,
    p_base_currency,
    p_from_fx_rate,
    p_from_fx_rate_date,
    p_from_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true
  )
  returning id into v_from_id;

  -- Insert credit leg (money arrives in the to-account).
  insert into public.transactions (
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer
  ) values (
    v_user_id,
    p_to_account_id,
    p_to_amount_cents,
    p_to_currency,
    p_to_base_cents,
    p_base_currency,
    p_to_fx_rate,
    p_to_fx_rate_date,
    p_to_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true
  )
  returning id into v_to_id;

  -- Bi-directionally link the two legs so each side knows its counterpart.
  update public.transactions set transfer_pair_id = v_to_id   where id = v_from_id;
  update public.transactions set transfer_pair_id = v_from_id where id = v_to_id;

  return jsonb_build_object('from_id', v_from_id, 'to_id', v_to_id);
end;
$$;

-- Grant execute to the authenticated role so PostgREST can call it.
grant execute on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint,
  text,
  double precision, double precision,
  date, date,
  boolean, boolean,
  date,
  text
) to authenticated;
