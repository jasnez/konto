-- =============================================================================
-- 20260620120000_00063_fix_get_spending_by_category_ambiguity.sql
--
-- Hotfix za 00062: get_spending_by_category je u prod-u puknuo s
--   "ERROR: 42702: column reference 'category_id' is ambiguous"
-- jer RETURNS TABLE deklaracija (category_id, amount_cents,
-- prev_amount_cents, monthly_history) introduce-uje PL/pgSQL output
-- varijable s istim imenima kao kolone u CTE-ovima. Default
-- #variable_conflict policy je 'error', pa svaka unqualified column
-- referenca koja se podudara s output varijablom raise-a.
--
-- Fix: dodati `#variable_conflict use_column` na vrh tijela funkcije.
-- Govori PL/pgSQL-u: "kad postoji ambiguity između output varijable i
-- column reference-a, uvijek prefer kolonu". Sigurno za naš slučaj jer
-- output varijable se ne koriste u tijelu funkcije za read — samo se
-- popunjavaju kroz `return query`.
--
-- Posljedice za klijent: nema. Signature i ponašanje neizmijenjeni;
-- jedina razlika je da funkcija sada *radi* (umjesto da raise-a).
--
-- Zašto se nije uhvatilo lokalno:
--   - `pnpm exec supabase db reset` je primijenio migraciju bez greške
--     (PL/pgSQL parse OK, varijable se evaluiraju lazy).
--   - Greška se javlja samo pri *pozivanju* funkcije, što nismo
--     pokrili u CI smoke testovima (nema seed user-a sa tx-ovima).
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
#variable_conflict use_column
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

notify pgrst, 'reload schema';
