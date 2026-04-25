-- =============================================================================
-- 20260526120000_00035_account_balance_multi_currency.sql
--
-- Fixes balance when a transaction is stored in a foreign currency (e.g. SEK
-- on a receipt) while the account is in BAM: use base_amount_cents for the
-- sum when base_currency matches the account, not the raw original minor units.
--
-- Replaces 00013's sum(original only), which mis-counted e.g. -342.17 SEK as
-- -342.17 KM when the column is displayed in the account's currency.
-- =============================================================================

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
    select sum(
      case
        when upper(t.original_currency) = upper(a.currency) then t.original_amount_cents
        when upper(t.base_currency) = upper(a.currency) then t.base_amount_cents
        else t.original_amount_cents
      end
    )
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

-- Backfill: re-align every account with the new sum. Safe to run repeatedly.
update public.accounts a
set current_balance_cents = coalesce((
  select sum(
    case
      when upper(t.original_currency) = upper(a.currency) then t.original_amount_cents
      when upper(t.base_currency) = upper(a.currency) then t.base_amount_cents
      else t.original_amount_cents
    end
  )
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0)
where a.current_balance_cents is distinct from coalesce((
  select sum(
    case
      when upper(t.original_currency) = upper(a.currency) then t.original_amount_cents
      when upper(t.base_currency) = upper(a.currency) then t.base_amount_cents
      else t.original_amount_cents
    end
  )
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0);
