-- =============================================================================
-- 20260612120000_00055_get_period_spent_for_category.sql
--
-- F3-E1-T3: helper RPC for the budget Add/Edit form preview.
--
-- "Prošli mjesec si potrošio X u kategoriji Y" → so the user can pick a
-- realistic limit. The existing get_current_period_spent (00054) is keyed
-- on a budget id, but the form needs to query before any budget exists.
--
-- Signature:
--   get_period_spent_for_category(
--     p_category_id uuid,
--     p_period text,           -- 'monthly' | 'weekly'
--     p_offset int             -- 0 = current, -1 = previous, +1 = next, …
--   ) returns bigint
--
-- Symmetric with get_current_period_spent: SECURITY INVOKER, same
-- exclusion rules (transfer / excluded / soft-deleted skipped). Auth is
-- enforced by RLS on transactions; a foreign category id returns 0.
-- =============================================================================

create or replace function public.get_period_spent_for_category(
  p_category_id uuid,
  p_period      text,
  p_offset      int default 0
)
returns bigint
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_period_start date;
  v_period_end   date;
  v_anchor       date;
  v_spent        bigint;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_period not in ('monthly', 'weekly') then
    raise exception 'INVALID_PERIOD';
  end if;
  if p_offset < -120 or p_offset > 120 then
    -- Loose guard: 10 years either way is plenty; further calls are abuse
    -- (also keeps the date math from overflowing weird ranges).
    raise exception 'INVALID_OFFSET';
  end if;

  if p_period = 'monthly' then
    v_anchor       := (date_trunc('month', current_date) + (p_offset || ' months')::interval)::date;
    v_period_start := v_anchor;
    v_period_end   := (v_anchor + interval '1 month')::date;
  else
    v_anchor       := (date_trunc('week', current_date) + (p_offset || ' weeks')::interval)::date;
    v_period_start := v_anchor;
    v_period_end   := (v_anchor + interval '7 days')::date;
  end if;

  select coalesce(sum(abs(t.base_amount_cents)), 0)
    into v_spent
    from public.transactions t
   where t.user_id           = v_user_id
     and t.category_id       = p_category_id
     and t.transaction_date >= v_period_start
     and t.transaction_date  < v_period_end
     and coalesce(t.is_excluded, false) = false
     and coalesce(t.is_transfer, false) = false
     and t.deleted_at is null;

  return coalesce(v_spent, 0);
end;
$$;

revoke all on function public.get_period_spent_for_category(uuid, text, int) from public;
grant execute on function public.get_period_spent_for_category(uuid, text, int) to authenticated;

comment on function public.get_period_spent_for_category(uuid, text, int) is
  'F3-E1-T3: returns total spending in a category for a given period offset (0=current, -1=previous, …).';

notify pgrst, 'reload schema';
