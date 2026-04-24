-- =============================================================================
-- 20260424145000_00018_merchants_transaction_count_trigger.sql
--
-- Keep public.merchants.transaction_count in sync with the number of live
-- (non-soft-deleted) transactions that reference each merchant.
--
-- Why
-- ---
-- Migration 00006 declared the column and `search_merchants` uses it as a
-- ranking signal. Nothing ever incremented it, so:
--   * autocomplete ranking is meaningless until users have data
--   * the delete-guard in `deleteMerchant` that blocks removal when
--     transaction_count > 0 is decorative — it always sees 0, and since the
--     transactions.merchant_id FK is `ON DELETE SET NULL`, deleting a
--     referenced merchant silently unlinks its transactions.
--
-- Strategy: authoritative re-count per affected merchant
-- ------------------------------------------------------
-- Same shape as the account balance trigger (migration 00013). Collect the
-- set of merchant_ids that may have changed (OLD + NEW, minus nulls), then
-- rewrite each one's count as COUNT(*) over live rows. Correct under every
-- edge case:
--   * INSERT / DELETE transaction (with or without merchant_id)
--   * UPDATE merchant_id: null→m, m→null, m1→m2
--   * UPDATE deleted_at: soft-delete or restore
-- Cost is O(n_tx_for_merchant) per write; `idx_tx_merchant` supports it.
--
-- One-time backfill at the bottom re-aligns existing rows.
-- =============================================================================

create or replace function public.update_merchant_transaction_count()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_merchant_ids uuid[];
begin
  if tg_op = 'INSERT' then
    v_merchant_ids := array[new.merchant_id];
  elsif tg_op = 'DELETE' then
    v_merchant_ids := array[old.merchant_id];
  else
    -- UPDATE: include both sides (they may differ, one may be null).
    if new.merchant_id is distinct from old.merchant_id then
      v_merchant_ids := array[new.merchant_id, old.merchant_id];
    else
      v_merchant_ids := array[new.merchant_id];
    end if;
  end if;

  -- Strip nulls; a null merchant_id has nothing to recount.
  v_merchant_ids := array(
    select distinct x
    from unnest(v_merchant_ids) as x
    where x is not null
  );

  if array_length(v_merchant_ids, 1) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  update public.merchants m
  set transaction_count = coalesce((
    select count(*)
    from public.transactions t
    where t.merchant_id = m.id
      and t.deleted_at is null
  ), 0)
  where m.id = any(v_merchant_ids);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger tx_after_iud_update_merchant_count
  after insert or update of merchant_id, deleted_at or delete on public.transactions
  for each row execute function public.update_merchant_transaction_count();

-- Idempotent backfill.
update public.merchants m
set transaction_count = coalesce((
  select count(*)
  from public.transactions t
  where t.merchant_id = m.id
    and t.deleted_at is null
), 0)
where m.transaction_count is distinct from coalesce((
  select count(*)
  from public.transactions t
  where t.merchant_id = m.id
    and t.deleted_at is null
), 0);
