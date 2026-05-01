-- =============================================================================
-- Dashboard: exclude transactions on Pasiva accounts (loan, credit_card) from
-- monthly cash-flow aggregates (income, expense, net, avg daily). Loan-account
-- flows represent debt repayment / interest charges and should be modeled as
-- transfers or as expenses on the funding (Aktiva) account, not as income on
-- the loan account itself. Defense-in-depth: even if the UI accidentally
-- accepts an income/expense kind on a Pasiva account, the dashboard ignores it.
-- Account balances and the standalone "Zaduženja" total are unchanged.
-- =============================================================================

create or replace function public.get_monthly_summary(
  p_year int,
  p_month int,
  p_base_currency text,
  p_today_date date
) returns jsonb
language plpgsql
security invoker
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date;
  v_month_end date;
  v_prev_month_start date;
  v_prev_month_end date;
  v_days_in_month int;
  v_day_divisor int;
  v_today date := coalesce(p_today_date, current_date);
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'get_monthly_summary requires authenticated user';
  end if;

  if p_month < 1 or p_month > 12 then
    raise exception 'p_month must be between 1 and 12';
  end if;

  if p_year < 2000 or p_year > 3000 then
    raise exception 'p_year out of allowed range';
  end if;

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_prev_month_start := (v_month_start - interval '1 month')::date;
  v_prev_month_end := (v_month_start - interval '1 day')::date;
  v_days_in_month := extract(day from v_month_end)::int;

  if p_year = extract(year from v_today)::int
     and p_month = extract(month from v_today)::int then
    v_day_divisor := greatest(extract(day from v_today)::int, 1);
  else
    v_day_divisor := greatest(v_days_in_month, 1);
  end if;

  with normalized as (
    select upper(trim(p_base_currency)) as base_currency
  ),
  latest_fx as (
    select quote, rate
    from (
      select
        fr.quote,
        fr.rate,
        row_number() over (
          partition by fr.quote
          order by fr.date desc
        ) as rn
      from public.fx_rates fr
      where fr.base = 'EUR'
        and fr.date <= v_today
    ) ranked
    where rn = 1
  ),
  account_balances as (
    select
      a.current_balance_cents::bigint as amount_cents,
      upper(a.currency) as currency
    from public.accounts a
    where a.user_id = v_user_id
      and a.deleted_at is null
      and a.include_in_net_worth = true
  ),
  converted_balances as (
    select
      case
        when ab.currency = n.base_currency then ab.amount_cents
        when ab.currency = 'BAM' and n.base_currency = 'EUR' then
          round(ab.amount_cents::numeric / 1.95583)::bigint
        when ab.currency = 'EUR' and n.base_currency = 'BAM' then
          round(ab.amount_cents::numeric * 1.95583)::bigint
        when ab.currency = 'EUR' then
          round(ab.amount_cents::numeric * coalesce(fx_base.rate, 1))::bigint
        when n.base_currency = 'EUR' then
          round(ab.amount_cents::numeric / nullif(coalesce(fx_from.rate, 1), 0))::bigint
        else
          round(
            (
              ab.amount_cents::numeric / nullif(coalesce(fx_from.rate, 1), 0)
            ) * coalesce(fx_base.rate, 1)
          )::bigint
      end as base_amount_cents
    from account_balances ab
    cross join normalized n
    left join latest_fx fx_from on fx_from.quote = ab.currency
    left join latest_fx fx_base on fx_base.quote = n.base_currency
  ),
  liability_account_balances as (
    select
      a.current_balance_cents::bigint as amount_cents,
      upper(a.currency) as currency
    from public.accounts a
    where a.user_id = v_user_id
      and a.deleted_at is null
      and a.type in ('loan', 'credit_card')
      and a.current_balance_cents < 0
  ),
  converted_liabilities as (
    select
      case
        when lab.currency = n.base_currency then lab.amount_cents
        when lab.currency = 'BAM' and n.base_currency = 'EUR' then
          round(lab.amount_cents::numeric / 1.95583)::bigint
        when lab.currency = 'EUR' and n.base_currency = 'BAM' then
          round(lab.amount_cents::numeric * 1.95583)::bigint
        when lab.currency = 'EUR' then
          round(lab.amount_cents::numeric * coalesce(fx_base.rate, 1))::bigint
        when n.base_currency = 'EUR' then
          round(lab.amount_cents::numeric / nullif(coalesce(fx_from.rate, 1), 0))::bigint
        else
          round(
            (
              lab.amount_cents::numeric / nullif(coalesce(fx_from.rate, 1), 0)
            ) * coalesce(fx_base.rate, 1)
          )::bigint
      end as base_amount_cents
    from liability_account_balances lab
    cross join normalized n
    left join latest_fx fx_from on fx_from.quote = lab.currency
    left join latest_fx fx_base on fx_base.quote = n.base_currency
  ),
  tx as (
    select
      t.base_amount_cents::bigint as amount_cents,
      t.transaction_date
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    cross join normalized n
    where t.user_id = v_user_id
      and t.deleted_at is null
      and t.is_transfer = false
      and t.is_excluded = false
      and upper(t.base_currency) = n.base_currency
      and t.transaction_date between v_prev_month_start and v_month_end
      and a.type not in ('loan', 'credit_card')
      and not exists (
        select 1
        from public.categories c
        where c.id = t.category_id
          and c.user_id = t.user_id
          and c.slug = 'opening_balance'
          and c.deleted_at is null
      )
  ),
  tx_aggregates as (
    select
      coalesce(sum(
        case
          when tx.transaction_date between v_month_start and v_month_end
               and tx.amount_cents > 0
          then tx.amount_cents
          else 0
        end
      ), 0)::bigint as month_income,
      coalesce(sum(
        case
          when tx.transaction_date between v_month_start and v_month_end
               and tx.amount_cents < 0
          then -tx.amount_cents
          else 0
        end
      ), 0)::bigint as month_expense,
      coalesce(sum(
        case
          when tx.transaction_date between v_prev_month_start and v_prev_month_end
               and tx.amount_cents > 0
          then tx.amount_cents
          else 0
        end
      ), 0)::bigint as prev_month_income,
      coalesce(sum(
        case
          when tx.transaction_date between v_prev_month_start and v_prev_month_end
               and tx.amount_cents < 0
          then -tx.amount_cents
          else 0
        end
      ), 0)::bigint as prev_month_expense
    from tx
  ),
  balance_aggregate as (
    select coalesce(sum(base_amount_cents), 0)::bigint as total_balance
    from converted_balances
  ),
  liability_aggregate as (
    select coalesce(sum(-base_amount_cents), 0)::bigint as total_liabilities
    from converted_liabilities
  ),
  final as (
    select
      b.total_balance,
      l.total_liabilities,
      t.month_income,
      t.month_expense,
      (t.month_income - t.month_expense)::bigint as month_net,
      (t.prev_month_income - t.prev_month_expense)::bigint as prev_month_net,
      round(t.month_expense::numeric / v_day_divisor)::bigint as avg_daily_spend
    from tx_aggregates t
    cross join balance_aggregate b
    cross join liability_aggregate l
  )
  select jsonb_build_object(
    'total_balance', f.total_balance,
    'total_liabilities', f.total_liabilities,
    'month_income', f.month_income,
    'month_expense', f.month_expense,
    'month_net', f.month_net,
    'prev_month_net', f.prev_month_net,
    'net_change_percent',
      case
        when f.prev_month_net = 0 and f.month_net = 0 then 0
        when f.prev_month_net = 0 and f.month_net > 0 then 100
        when f.prev_month_net = 0 and f.month_net < 0 then -100
        else round((((f.month_net - f.prev_month_net)::numeric / abs(f.prev_month_net::numeric)) * 100), 1)
      end,
    'avg_daily_spend', f.avg_daily_spend
  )
  into result
  from final f;

  return result;
end;
$$;

grant execute on function public.get_monthly_summary(int, int, text, date) to authenticated;

create or replace function public.get_monthly_summary(
  p_year int,
  p_month int,
  p_base_currency text
) returns jsonb
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select public.get_monthly_summary(p_year, p_month, p_base_currency, null::date);
$$;

grant execute on function public.get_monthly_summary(int, int, text) to authenticated;

notify pgrst, 'reload schema';
