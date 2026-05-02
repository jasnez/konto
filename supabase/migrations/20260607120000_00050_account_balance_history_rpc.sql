-- 00050: get_account_balance_history RPC.
--
-- Powers the per-account sparkline on the /racuni cards (audit R7). Each
-- card needs a ~30-point time series of end-of-day balances so the user
-- can read the trend at a glance ("rate na padu", "štedni raste", etc.).
--
-- Per-account currency: every account has a single currency; the
-- sparkline is rendered in that native currency (audit-decision Q1=B).
-- Transactions on an account can in rare cases use a different
-- `original_currency` than `account.currency` (cross-currency posting),
-- so we mirror the same case expression that the `update_account_balance`
-- trigger uses (00035) — `original` if it matches the account currency,
-- otherwise `base` if THAT matches, else fall back to `original`. This
-- keeps the sparkline endpoints in lockstep with `current_balance_cents`.
--
-- All transactions are summed, including transfers and opening-balance
-- rows, because all of them move the account ledger. The RPC does NOT
-- apply `is_transfer`/`is_excluded` filters that the dashboard summary
-- uses — those are flow-only filters; this is a balance series.
--
-- Algorithm: end-of-day balance is the sum of every transaction on or
-- before that date. To avoid scanning the entire transaction history
-- per day, we:
--   1. Compute daily net change from window-start onward (one group-by).
--   2. Derive the window-start balance as
--        current_balance - SUM(daily_change) over the entire window.
--   3. For each day in the window, walk forward by accumulating
--        net change up to and including that day on top of the start.
--
-- Performance: 30 days x N accounts. With 10 accounts that's 300 rows
-- and one indexed scan over `transactions` (idx_tx_user_date covers
-- the user_id + date filter; the planner handles the per-account
-- partitioning via account_id in the case expression).
--
-- Security: SECURITY INVOKER; auth.uid() is captured locally and used
-- to scope every read. RLS on accounts/transactions does the heavy
-- lifting; the explicit user check is defense-in-depth.

create or replace function public.get_account_balance_history(
  p_days int default 30
)
returns table (
  account_id uuid,
  day date,
  balance_cents bigint
)
language plpgsql
security invoker
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_size int;
  v_window_start date;
  v_window_end date;
begin
  if v_user_id is null then
    raise exception 'get_account_balance_history requires authenticated user';
  end if;

  -- Defensive bounds. Sparkline UI is calibrated for ~30 days; allowing
  -- arbitrary `p_days` would let a single call balloon into a full table
  -- scan. Hard cap at 365 days protects against accidental misuse without
  -- being so tight that future longer charts can't reuse the function.
  if p_days < 1 or p_days > 365 then
    raise exception 'p_days must be between 1 and 365';
  end if;

  v_window_size := p_days;
  v_window_end := current_date;
  v_window_start := v_window_end - (v_window_size - 1);

  return query
  with date_series as (
    select generate_series(v_window_start, v_window_end, interval '1 day')::date as day
  ),
  -- Per-account, per-day net change. The case expression mirrors the
  -- `update_account_balance` trigger (migration 00035) so that
  -- reconstructed end-of-day balances stay consistent with the account's
  -- live `current_balance_cents`.
  daily_changes as (
    select
      t.account_id,
      t.transaction_date as day,
      sum(
        case
          when upper(t.original_currency) = upper(a.currency) then t.original_amount_cents
          when upper(t.base_currency) = upper(a.currency) then t.base_amount_cents
          else t.original_amount_cents
        end
      )::bigint as net_change
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.user_id = v_user_id
      and a.user_id = v_user_id
      and t.deleted_at is null
      and a.deleted_at is null
      and t.transaction_date >= v_window_start
    group by t.account_id, t.transaction_date
  ),
  -- Effective balance at the very start of the window:
  --   current_balance - sum of all changes inside the window.
  -- Computed once per account so we don't have to re-derive it per day.
  account_starts as (
    select
      a.id as account_id,
      a.current_balance_cents - coalesce(
        (select sum(dc.net_change) from daily_changes dc where dc.account_id = a.id),
        0
      )::bigint as start_balance
    from public.accounts a
    where a.user_id = v_user_id
      and a.deleted_at is null
  )
  select
    s.account_id,
    ds.day,
    (
      s.start_balance + coalesce(
        (
          select sum(dc.net_change)
          from daily_changes dc
          where dc.account_id = s.account_id
            and dc.day <= ds.day
        ),
        0
      )
    )::bigint as balance_cents
  from account_starts s
  cross join date_series ds
  order by s.account_id, ds.day;
end;
$$;

comment on function public.get_account_balance_history(int) is
  'Per-account end-of-day balance series for the last p_days days, in each account''s native currency. Powers /racuni sparklines (audit R7).';

grant execute on function public.get_account_balance_history(int) to authenticated;
