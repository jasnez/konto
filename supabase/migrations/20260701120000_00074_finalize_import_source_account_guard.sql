-- 00074: finalize_import_batch must verify ownership of the SOURCE account.
--
-- Audit 2026-06-10 (K-1, Kritično). finalize_import_batch is SECURITY DEFINER
-- (RLS-bypassing) and granted to `authenticated`, so any logged-in user can
-- invoke it directly via PostgREST. The 00046 version validates ownership of
-- the transfer destination (`to_account_id`) but NEVER of the regular row's
-- source `account_id` — it trusts whatever `account_id` the caller puts in
-- p_rows. Because:
--   * transactions.account_id FKs accounts(id) only (no composite
--     (user_id, account_id) constraint), and
--   * the balance trigger (00013) sums original_amount_cents by account_id
--     with NO user_id filter,
-- a caller with a own 'ready' batch could craft p_rows referencing a VICTIM's
-- account_id and corrupt the victim's accounts.current_balance_cents (the row
-- is invisible to the victim under SELECT RLS, but their balance is wrong).
--
-- Fix: mirror the existing to_account_id ownership check for the source
-- account_id in BOTH the regular-import branch and the transfer branch.
-- The TypeScript pipeline already sets account_id from a verified
-- import_batches.account_id, so this is defense-in-depth for the legitimate
-- path and a hard stop for the direct-RPC attack path.
--
-- Body is otherwise byte-identical to the 00046 definition. Grants re-applied
-- per the 00070 canonical pattern (idempotent).

create or replace function public.finalize_import_batch(
  p_batch_id uuid,
  p_rows jsonb,
  p_dedup_skipped int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_status   text;
  v_imported bigint := 0;
  v_dedup    int := coalesce(p_dedup_skipped, 0);
  r          record;
  v_from_id  uuid;
  v_to_id    uuid;
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

  for r in
    select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as rr(
      account_id                uuid,
      to_account_id             uuid,
      original_amount_cents     bigint,
      original_currency         text,
      base_amount_cents         bigint,
      base_currency             text,
      account_ledger_cents      bigint,
      fx_rate                   numeric(20,10),
      fx_rate_date              date,
      fx_stale                  boolean,
      to_original_amount_cents  bigint,
      to_original_currency      text,
      to_base_amount_cents      bigint,
      to_account_ledger_cents   bigint,
      to_fx_rate                numeric(20,10),
      to_fx_rate_date           date,
      to_fx_stale               boolean,
      transaction_date          date,
      merchant_raw              text,
      merchant_id               uuid,
      category_id               uuid,
      category_source           text,
      category_confidence       real,
      dedup_hash                text
    )
  loop
    -- K-1: the source account_id arrives in the caller-supplied payload and
    -- this function bypasses RLS. Every branch below inserts into
    -- transactions using r.account_id, so its ownership must be verified
    -- explicitly here — RLS would have done it for a non-DEFINER path.
    if not exists (
      select 1 from public.accounts
      where id = r.account_id and user_id = v_user_id and deleted_at is null
    ) then
      raise exception 'FORBIDDEN: from_account';
    end if;

    if r.to_account_id is null then
      -- Regular import row: single insert, dedup-aware, fully categorised.
      insert into public.transactions (
        user_id, account_id, import_batch_id, source,
        original_amount_cents, original_currency,
        base_amount_cents, base_currency,
        account_ledger_cents,
        fx_rate, fx_rate_date, fx_stale,
        transaction_date, merchant_raw, merchant_id,
        category_id, category_source, category_confidence, dedup_hash
      ) values (
        v_user_id, r.account_id, p_batch_id, 'import_pdf',
        r.original_amount_cents, r.original_currency,
        r.base_amount_cents, r.base_currency,
        r.account_ledger_cents,
        r.fx_rate, r.fx_rate_date, r.fx_stale,
        r.transaction_date, r.merchant_raw, r.merchant_id,
        r.category_id, r.category_source, r.category_confidence, r.dedup_hash
      );
    else
      -- Transfer pair conversion. Source account ownership is verified above.
      -- Destination ownership must be checked explicitly because users can
      -- only target their own cash accounts.
      if not exists (
        select 1 from public.accounts
        where id = r.to_account_id and user_id = v_user_id and deleted_at is null
      ) then
        raise exception 'FORBIDDEN: to_account';
      end if;

      if r.account_id = r.to_account_id then
        raise exception 'INVALID: from and to accounts must differ';
      end if;

      v_from_id := gen_random_uuid();
      v_to_id   := gen_random_uuid();

      -- Debit leg on the source account (matches the parsed-statement line).
      insert into public.transactions (
        id,
        user_id, account_id, import_batch_id, source,
        original_amount_cents, original_currency,
        base_amount_cents, base_currency,
        account_ledger_cents,
        fx_rate, fx_rate_date, fx_stale,
        transaction_date, merchant_raw,
        is_transfer, transfer_pair_id
      ) values (
        v_from_id,
        v_user_id, r.account_id, p_batch_id, 'import_pdf',
        r.original_amount_cents, r.original_currency,
        r.base_amount_cents, r.base_currency,
        r.account_ledger_cents,
        r.fx_rate, r.fx_rate_date, r.fx_stale,
        r.transaction_date, r.merchant_raw,
        true, v_to_id
      );

      -- Credit leg on the cash account. No merchant, no category — transfers
      -- aren't categorised. Currency / amount can differ from the source leg
      -- when the user holds cash in a different currency than the bank
      -- account (handled by the TS layer's cross-rate FX computation).
      insert into public.transactions (
        id,
        user_id, account_id, import_batch_id, source,
        original_amount_cents, original_currency,
        base_amount_cents, base_currency,
        account_ledger_cents,
        fx_rate, fx_rate_date, fx_stale,
        transaction_date,
        is_transfer, transfer_pair_id
      ) values (
        v_to_id,
        v_user_id, r.to_account_id, p_batch_id, 'import_pdf',
        r.to_original_amount_cents, r.to_original_currency,
        r.to_base_amount_cents, r.base_currency,
        r.to_account_ledger_cents,
        r.to_fx_rate, r.to_fx_rate_date, r.to_fx_stale,
        r.transaction_date,
        true, v_from_id
      );
    end if;

    v_imported := v_imported + 1;
  end loop;

  delete from public.parsed_transactions
  where batch_id = p_batch_id and user_id = v_user_id;

  update public.import_batches
     set status        = 'imported',
         imported_at   = now(),
         error_message = null,
         dedup_skipped = v_dedup
   where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object('imported', v_imported);
end;
$$;

-- Re-apply the canonical ACL (idempotent; matches 00070).
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from public;
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from anon;
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from authenticated;
grant execute on function public.finalize_import_batch(uuid, jsonb, int) to authenticated;

comment on function public.finalize_import_batch(uuid, jsonb, int) is
  'Atomically materialise a parsed batch into the transactions table. Each row in p_rows is either a regular import (when to_account_id is null) or a transfer pair (when to_account_id references a user-owned cash account). Both the source account_id and any to_account_id are verified to belong to the caller (K-1, audit 2026-06-10), since this SECURITY DEFINER function bypasses RLS.';

notify pgrst, 'reload schema';
