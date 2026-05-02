-- =============================================================================
-- 20260611120000_00054_get_current_period_spent.sql
--
-- F3-E1-T2: RPC that returns how much has been spent in the *current* period
-- for a given budget. The dashboard widget and the /budzeti list call this
-- once per active budget to compute progress.
--
-- Returns: bigint (sum of |base_amount_cents|) for transactions in the
-- budget's category, in the budget's current period.
--
-- Period boundaries:
--   - monthly: [date_trunc('month', current_date), +1 month)
--   - weekly:  [date_trunc('week',  current_date), +7 days)   -- ISO Mon..Sun
--
-- Why base_amount_cents (not original)?
-- ─────────────────────────────────────
-- Multi-currency: if a user has BAM + EUR transactions in the same category,
-- summing original_amount_cents is meaningless. base_amount_cents is the
-- profile.base_currency-normalised value populated by parse-pipeline / the
-- transaction Server Actions, so summing it is correct cross-currency.
--
-- Why abs()?
-- ──────────
-- Outflow rows have negative amounts; treating spend as a positive scalar is
-- the natural progress unit. For 'saving' kind the sign is also negative
-- (transfer out → savings account), so abs() works for both budgetable kinds.
--
-- Excludes:
--   - is_excluded = true (user has explicitly opted-out of summaries)
--   - is_transfer = true (transfers don't count as spending)
--   - deleted_at IS NOT NULL (soft-deleted)
--
-- Auth: SECURITY INVOKER. The function only needs to read the budget +
-- transactions; both have RLS that scopes to auth.uid(). If a caller asks
-- for a foreign budget_id the budget select returns null and we return 0.
-- =============================================================================

create or replace function public.get_current_period_spent(p_budget_id uuid)
returns bigint
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid;
  v_category_id  uuid;
  v_period       text;
  v_period_start date;
  v_period_end   date;
  v_spent        bigint;
begin
  -- 1. Load the budget. RLS already prevents cross-user reads; we
  --    additionally filter active = true so deactivated budgets always
  --    return 0 (history view should not show fresh "spent" numbers).
  select b.user_id, b.category_id, b.period
    into v_user_id, v_category_id, v_period
    from public.budgets b
   where b.id = p_budget_id
     and b.active is true;

  if v_user_id is null then
    return 0;
  end if;

  -- 2. Compute period bounds. We use date_trunc on `current_date` so the
  --    RPC is timezone-stable inside Postgres' session timezone (Supabase
  --    default UTC). Frontends that need local-week boundaries should
  --    handle the offset on their side; for v1 the small skew at week
  --    boundaries is acceptable.
  if v_period = 'monthly' then
    v_period_start := date_trunc('month', current_date)::date;
    v_period_end   := (date_trunc('month', current_date) + interval '1 month')::date;
  elsif v_period = 'weekly' then
    v_period_start := date_trunc('week', current_date)::date;
    v_period_end   := (date_trunc('week', current_date) + interval '7 days')::date;
  else
    -- Unknown period (shouldn't happen given the CHECK constraint).
    return 0;
  end if;

  -- 3. Sum abs(base_amount_cents) inside the window. RLS on transactions
  --    enforces user_id = auth.uid(); the explicit user_id filter mirrors
  --    that for defense-in-depth and helps the planner.
  select coalesce(sum(abs(t.base_amount_cents)), 0)
    into v_spent
    from public.transactions t
   where t.user_id           = v_user_id
     and t.category_id       = v_category_id
     and t.transaction_date >= v_period_start
     and t.transaction_date  < v_period_end
     and coalesce(t.is_excluded, false) = false
     and coalesce(t.is_transfer, false) = false
     and t.deleted_at is null;

  return coalesce(v_spent, 0);
end;
$$;

revoke all on function public.get_current_period_spent(uuid) from public;
grant execute on function public.get_current_period_spent(uuid) to authenticated;

comment on function public.get_current_period_spent(uuid) is
  'F3-E1-T2: returns total spending (|base_amount_cents|) in the budget''s current period.';

notify pgrst, 'reload schema';
