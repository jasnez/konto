-- F2-E3-T2: atomic finalize + reject of an import batch.
--
-- - Adds `imported_at` + `rejected` status so the app can distinguish between
--   a user-cancelled batch and a never-confirmed one.
-- - Introduces `finalize_import_batch` RPC that performs the "insert many
--   transactions + delete staging + mark batch" cycle in a single Postgres
--   transaction. FX conversion and dedup hashes are pre-computed in Node
--   (see `lib/server/actions/imports.ts`) and passed in as `jsonb` to keep the
--   function free of external network calls.

alter table public.import_batches
  add column if not exists imported_at timestamptz;

alter table public.import_batches
  drop constraint if exists import_batches_status_check;

alter table public.import_batches
  add constraint import_batches_status_check
  check (status in ('uploaded','parsing','ready','imported','failed','rejected'));

create or replace function public.finalize_import_batch(
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_status   text;
  v_imported bigint := 0;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
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
        account_id            uuid,
        original_amount_cents bigint,
        original_currency     text,
        base_amount_cents     bigint,
        base_currency         text,
        fx_rate               double precision,
        fx_rate_date          date,
        fx_stale              boolean,
        transaction_date      date,
        merchant_raw          text,
        merchant_id           uuid,
        category_id           uuid,
        category_source       text,
        dedup_hash            text
      )
  ),
  inserted as (
    insert into public.transactions (
      user_id, account_id, import_batch_id, source,
      original_amount_cents, original_currency,
      base_amount_cents, base_currency,
      fx_rate, fx_rate_date, fx_stale,
      transaction_date, merchant_raw, merchant_id,
      category_id, category_source, dedup_hash
    )
    select
      v_user_id, ip.account_id, p_batch_id, 'import_pdf',
      ip.original_amount_cents, ip.original_currency,
      ip.base_amount_cents, ip.base_currency,
      ip.fx_rate, ip.fx_rate_date, ip.fx_stale,
      ip.transaction_date, ip.merchant_raw, ip.merchant_id,
      ip.category_id, ip.category_source, ip.dedup_hash
    from insert_payload ip
    returning 1
  )
  select count(*) into v_imported from inserted;

  delete from public.parsed_transactions
  where batch_id = p_batch_id and user_id = v_user_id;

  update public.import_batches
  set status       = 'imported',
      imported_at  = now(),
      error_message = null
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object('imported', v_imported);
end;
$$;

revoke all on function public.finalize_import_batch(uuid, jsonb) from public;
grant execute on function public.finalize_import_batch(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
