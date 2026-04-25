-- F2-E5-T1: import duplicate detection (account, date ±1 day, amount, trigram on description)
--
-- Replaces the exact dedup_hash-only pre-check with a Postgres function that
-- mirrors the product rules, including within-batch de-dupe (earlier row wins).
-- finalize_import_batch gains p_dedup_skipped; import_batches stores the count.

-- ---------------------------------------------------------------------------
-- import_batches: skipped duplicate row count
-- ---------------------------------------------------------------------------
alter table public.import_batches
  add column if not exists dedup_skipped int not null default 0
    check (dedup_skipped >= 0);

-- ---------------------------------------------------------------------------
-- import_dedup_filter(p_account_id, p_rows) -> int[]
--
-- p_rows: jsonb array of { transaction_date, original_amount_cents, merchant_raw }.
-- Returns 0-based indices of rows to skip (duplicates of an existing
-- public.transactions row or a prior row in the same batch, same order).
-- ---------------------------------------------------------------------------
create or replace function public.import_dedup_filter(
  p_account_id uuid,
  p_rows jsonb
) returns int[]
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_out   int[];
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_account_id is null then
    return array[]::int[];
  end if;

  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array'
     or coalesce(jsonb_array_length(p_rows), 0) = 0
  then
    return array[]::int[];
  end if;

  with
  cands as (
    select
      (r.ord - 1) :: int as idx,
      (r.val ->> 'transaction_date')::date as d,
      (r.val ->> 'original_amount_cents')::bigint as amt,
      public.normalize_for_categorization(coalesce(r.val ->> 'merchant_raw', '')) as norm
    from jsonb_array_elements(p_rows) with ordinality as r(val, ord)
  )
  select coalesce(
    (select
       array_agg(c1.idx order by c1.idx)
     from cands c1
     where
       exists (
         select 1
           from public.transactions t
          where t.user_id = v_uid
            and t.account_id = p_account_id
            and t.deleted_at is null
            and t.original_amount_cents = c1.amt
            and abs(t.transaction_date - c1.d) <= 1
            and extensions.similarity(
              public.normalize_for_categorization(t.merchant_raw),
              c1.norm
            ) > 0.8
       )
       or exists (
         select 1
           from cands c0
          where c0.idx < c1.idx
            and c0.amt = c1.amt
            and abs(c0.d - c1.d) <= 1
            and extensions.similarity(c0.norm, c1.norm) > 0.8
       )
    ),
    array[]::int[]
  ) into v_out;

  return coalesce(v_out, array[]::int[]);
end;
$$;

revoke all on function public.import_dedup_filter(uuid, jsonb) from public;
grant execute on function public.import_dedup_filter(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop old 2-argument overload so the new 3-argument function is the only
-- public.finalize_import_batch; PostgREST must see a single unambiguous
-- function when types are regenerated.
-- ---------------------------------------------------------------------------
drop function if exists public.finalize_import_batch(uuid, jsonb);

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
        account_id             uuid,
        original_amount_cents  bigint,
        original_currency      text,
        base_amount_cents      bigint,
        base_currency          text,
        fx_rate                double precision,
        fx_rate_date           date,
        fx_stale               boolean,
        transaction_date       date,
        merchant_raw           text,
        merchant_id            uuid,
        category_id            uuid,
        category_source        text,
        category_confidence    real,
        dedup_hash             text
      )
  ),
  inserted as (
    insert into public.transactions (
      user_id, account_id, import_batch_id, source,
      original_amount_cents, original_currency,
      base_amount_cents, base_currency,
      fx_rate, fx_rate_date, fx_stale,
      transaction_date, merchant_raw, merchant_id,
      category_id, category_source, category_confidence, dedup_hash
    )
    select
      v_user_id, ip.account_id, p_batch_id, 'import_pdf',
      ip.original_amount_cents, ip.original_currency,
      ip.base_amount_cents, ip.base_currency,
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

notify pgrst, 'reload schema';
