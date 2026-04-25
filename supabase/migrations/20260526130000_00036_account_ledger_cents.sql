-- =============================================================================
-- 20260526130000_00036_account_ledger_cents.sql
--
-- `account_ledger_cents` = signed amount in the *account* currency, used
-- only for `accounts.current_balance_cents`.  Fixes cases where
-- `original_currency` and `base_currency` (user reporting) both differ from
-- the account (e.g. profile EUR + BAM tekući + sken u SEK).
-- Balance trigger sums this column; legacy CASE lives only in the backfill.
-- =============================================================================

alter table public.transactions
  add column if not exists account_ledger_cents bigint;

update public.transactions t
set account_ledger_cents = s.v
from (
  select
    t2.id,
    case
      when upper(t2.original_currency) = upper(a.currency) then t2.original_amount_cents
      when upper(t2.base_currency) = upper(a.currency) then t2.base_amount_cents
      else t2.original_amount_cents
    end as v
  from public.transactions t2
  join public.accounts a on a.id = t2.account_id
) s
where t.id = s.id
  and (t.account_ledger_cents is null or t.account_ledger_cents is distinct from s.v);

-- Should be set for all rows; fail loudly if not.
alter table public.transactions
  alter column account_ledger_cents set not null;

-- Balance = sum of ledger only (single source of truth).
create or replace function public.update_account_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_account_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_account_ids := array[new.account_id];
  elsif tg_op = 'DELETE' then
    v_account_ids := array[old.account_id];
  else
    if new.account_id is distinct from old.account_id then
      v_account_ids := array[new.account_id, old.account_id];
    else
      v_account_ids := array[new.account_id];
    end if;
  end if;

  update public.accounts a
  set current_balance_cents = coalesce((
    select sum(t.account_ledger_cents)
    from public.transactions t
    where t.account_id = a.id
      and t.deleted_at is null
  ), 0)
  where a.id = any(v_account_ids);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

update public.accounts a
set current_balance_cents = coalesce((
  select sum(t.account_ledger_cents)
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0)
where a.current_balance_cents is distinct from coalesce((
  select sum(t.account_ledger_cents)
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0);

-- Transfers: each leg is already in that account’s currency in original_*.
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
    is_transfer
  ) values (
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
    true
  )
  returning id into v_from_id;

  insert into public.transactions (
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
    is_transfer
  ) values (
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
    true
  )
  returning id into v_to_id;

  update public.transactions
  set transfer_pair_id = v_to_id
  where id = v_from_id;

  update public.transactions
  set transfer_pair_id = v_from_id
  where id = v_to_id;

  return jsonb_build_object('from_id', v_from_id, 'to_id', v_to_id);
end;
$$;

create or replace function public.finalize_import_batch(
  p_batch_id uuid,
  p_rows jsonb,
  p_dedup_skipped int default 0
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_status   text;
  v_imported bigint := 0;
  v_dedup    int := coalesce(p_dedup_skipped, 0);
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if v_dedup < 0 then
    v_dedup := 0;
  end if;

  select status
    into v_status
    from public.import_batches
  where id = p_batch_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_status <> 'ready' then
    raise exception 'BAD_STATE';
  end if;

  with insert_payload as (
    select *
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
        account_id              uuid,
        original_amount_cents   bigint,
        original_currency       text,
        base_amount_cents       bigint,
        base_currency           text,
        account_ledger_cents    bigint,
        fx_rate                 double precision,
        fx_rate_date            date,
        fx_stale                boolean,
        transaction_date        date,
        merchant_raw            text,
        merchant_id             uuid,
        category_id             uuid,
        category_source         text,
        category_confidence     real,
        dedup_hash              text
      )
  ),
  inserted as (
    insert into public.transactions (
      user_id, account_id, import_batch_id, source,
      original_amount_cents, original_currency,
      base_amount_cents, base_currency,
      account_ledger_cents,
      fx_rate, fx_rate_date, fx_stale,
      transaction_date, merchant_raw, merchant_id,
      category_id, category_source, category_confidence, dedup_hash
    )
    select
      v_user_id, ip.account_id, p_batch_id, 'import_pdf',
      ip.original_amount_cents, ip.original_currency,
      ip.base_amount_cents, ip.base_currency,
      ip.account_ledger_cents,
      ip.fx_rate, ip.fx_rate_date, ip.fx_stale,
      ip.transaction_date, ip.merchant_raw, ip.merchant_id,
      ip.category_id, ip.category_source, ip.category_confidence, ip.dedup_hash
    from insert_payload ip
    returning 1
  )
  select count(*) into v_imported from inserted;

  delete from public.parsed_transactions
  where batch_id = p_batch_id and user_id = v_user_id;

  update public.import_batches
  set status          = 'imported',
      imported_at     = now(),
      error_message   = null,
      dedup_skipped   = v_dedup
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object('imported', v_imported);
end;
$$;

revoke all on function public.finalize_import_batch(uuid, jsonb, int) from public;
grant execute on function public.finalize_import_batch(uuid, jsonb, int) to authenticated;

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

notify pgrst, 'reload schema';
