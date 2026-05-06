-- =============================================================================
-- 20260619120000_00062_get_spending_by_category.sql
--
-- Spending by Category — RPC za dashboard "Pulse Donut" widget i /potrosnja
-- stranicu. Vraća redove po kategoriji + iznos u tekućem prozoru + iznos u
-- prethodnom (za delta strelicu) + 12-mjesečnu historiju (za sparkline).
--
-- Signature:
--   get_spending_by_category(
--     p_period         text,   -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
--     p_offset         int,    -- 0 = trenutni, -1 = prethodni, …
--     p_base_currency  text,   -- npr. 'BAM'
--     p_today_date     date    -- ankor (caller-supplied za TZ stabilnost)
--   ) returns table (
--     category_id       uuid,         -- NULL = "Nerazvrstano" bucket
--     category_name     text,
--     category_icon     text,
--     category_color    text,
--     category_slug     text,
--     amount_cents      bigint,
--     prev_amount_cents bigint,
--     monthly_history   bigint[]      -- length 12, oldest → newest
--   )
--
-- "quarterly" = rolling 3 months (zadnja 3 mjeseca), ne kalendarski kvartal,
-- jer "3 mjeseca" u UI-ju znači "zadnja 3 mjeseca" u svakodnevnom govoru.
--
-- Pravila isključenja (mirror 00055 i 00054):
--   - is_transfer = true        → skip
--   - is_excluded = true        → skip
--   - deleted_at  is not null   → skip
--   - non-base currency         → skip (silent, isto kao get_monthly_summary)
--   - non-expense kategorija    → skip (NULL kategorija prolazi kao bucket)
--
-- SECURITY INVOKER — RLS na transakcijama štiti od cross-user reada.
-- =============================================================================

create or replace function public.get_spending_by_category(
  p_period         text,
  p_offset         int    default 0,
  p_base_currency  text   default 'BAM',
  p_today_date     date   default current_date
)
returns table (
  category_id       uuid,
  category_name     text,
  category_icon     text,
  category_color    text,
  category_slug     text,
  amount_cents      bigint,
  prev_amount_cents bigint,
  monthly_history   bigint[]
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_period_start   date;
  v_period_end     date;
  v_prev_start     date;
  v_prev_end       date;
  v_history_start  date;
  v_history_end    date;
  v_currency       text := upper(trim(p_base_currency));
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_period not in ('weekly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'INVALID_PERIOD';
  end if;
  if p_offset < -120 or p_offset > 120 then
    raise exception 'INVALID_OFFSET';
  end if;

  -- Period boundaries: half-open [start, end).
  case p_period
    when 'weekly' then
      v_period_start := (date_trunc('week', p_today_date) + (p_offset || ' weeks')::interval)::date;
      v_period_end   := (v_period_start + interval '7 days')::date;
    when 'monthly' then
      v_period_start := (date_trunc('month', p_today_date) + (p_offset || ' months')::interval)::date;
      v_period_end   := (v_period_start + interval '1 month')::date;
    when 'quarterly' then
      -- Rolling 3 months ending today (+/- offset months). Note: end is
      -- exclusive (half-open), tako da uključujemo i današnji dan.
      v_period_end   := (p_today_date + (p_offset || ' months')::interval + interval '1 day')::date;
      v_period_start := (v_period_end - interval '3 months')::date;
    when 'yearly' then
      v_period_start := (date_trunc('year', p_today_date) + (p_offset || ' years')::interval)::date;
      v_period_end   := (v_period_start + interval '1 year')::date;
  end case;

  v_prev_end   := v_period_start;
  v_prev_start := (v_period_start - (v_period_end - v_period_start))::date;

  -- 12 mjeseci kalendarske historije, ending u kalendarskom mjesecu današnjeg
  -- dana (NE u period_end mjesecu — sparkline je uvijek "zadnjih 12 mjeseci"
  -- bez obzira koji period filter user gleda).
  v_history_end   := date_trunc('month', p_today_date)::date;
  v_history_start := (v_history_end - interval '11 months')::date;

  return query
  with expense_tx as (
    select
      t.category_id,
      abs(t.base_amount_cents)::bigint as amt,
      t.transaction_date
    from public.transactions t
    left join public.categories c
      on c.id = t.category_id
     and c.deleted_at is null
    where t.user_id = v_user_id
      and t.deleted_at is null
      and coalesce(t.is_transfer, false) = false
      and coalesce(t.is_excluded, false) = false
      and upper(t.base_currency) = v_currency
      -- expense kategorije (ili NULL bucket); income/transfer/saving/investment se
      -- ne prikazuju u "potrošnji". soft-deleted kategorije ne prolaze join,
      -- pa njihove transakcije završe u NULL bucket-u (Nerazvrstano).
      and (c.id is null or c.kind = 'expense')
  ),
  current_window as (
    select category_id, sum(amt)::bigint as amount_cents
    from expense_tx
    where transaction_date >= v_period_start
      and transaction_date <  v_period_end
    group by category_id
  ),
  prev_window as (
    select category_id, sum(amt)::bigint as prev_amount_cents
    from expense_tx
    where transaction_date >= v_prev_start
      and transaction_date <  v_prev_end
    group by category_id
  ),
  -- 12-month spine: generiraj sve mjesece i left-join, pa coalesce na 0.
  -- Tako je niz uvijek length 12 čak i ako kategorija nema podatke za neki
  -- mjesec.
  history_spine as (
    select gs.month_start::date as month_start
    from generate_series(v_history_start, v_history_end, interval '1 month') as gs(month_start)
  ),
  history_per_cat as (
    select cw.category_id, hs.month_start,
           coalesce(sum(case
             when et.transaction_date >= hs.month_start
              and et.transaction_date <  (hs.month_start + interval '1 month')::date
             then et.amt
           end), 0)::bigint as month_amount
    from current_window cw
    cross join history_spine hs
    left join expense_tx et on et.category_id is not distinct from cw.category_id
    group by cw.category_id, hs.month_start
  ),
  history_arr as (
    select category_id,
           array_agg(month_amount order by month_start) as monthly_history
    from history_per_cat
    group by category_id
  )
  select
    cw.category_id,
    coalesce(c.name, 'Nerazvrstano')              as category_name,
    coalesce(c.icon, '📦')                         as category_icon,
    c.color                                        as category_color,
    coalesce(c.slug, '__uncategorized__')         as category_slug,
    cw.amount_cents,
    coalesce(pw.prev_amount_cents, 0)::bigint     as prev_amount_cents,
    coalesce(ha.monthly_history,
             array_fill(0::bigint, ARRAY[12]))    as monthly_history
  from current_window cw
  left join public.categories c
    on c.id = cw.category_id
   and c.deleted_at is null
  left join prev_window pw on pw.category_id is not distinct from cw.category_id
  left join history_arr ha on ha.category_id is not distinct from cw.category_id
  order by cw.amount_cents desc, category_name asc;
end;
$$;

revoke all on function public.get_spending_by_category(text, int, text, date) from public;
grant execute on function public.get_spending_by_category(text, int, text, date) to authenticated;

comment on function public.get_spending_by_category(text, int, text, date) is
  'Spending by Category: per-category spend u prozoru (period+offset) + prev window + 12-mjesečna historija. SECURITY INVOKER (RLS-scoped).';

notify pgrst, 'reload schema';
