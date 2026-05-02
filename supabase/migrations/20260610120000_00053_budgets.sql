-- =============================================================================
-- 20260610120000_00053_budgets.sql
--
-- F3-E1-T1: monthly / weekly budgets per category.
--
-- Adds:
--   1. public.user_owns_budgetable_category(p_category_id) — helper that
--      gates writes to (a) the user's own categories, (b) only categories
--      with `kind in ('expense', 'saving')`. Income/transfer/investment
--      categories cannot be budgeted (it would be confusing UX and the
--      progress math is undefined for non-outflow kinds).
--   2. public.budgets — one row per (user, category, period) when active.
--      Inactive rows accumulate as history; partial unique index on
--      `active = true` lets a user re-create a budget after deactivating
--      the previous one.
--   3. RLS policies (select / insert / update / delete) using
--      `(select auth.uid())` (initplan-cached, same pattern as the rest of
--      the schema).
--
-- Why bigint for amount?
-- ──────────────────────
-- Mirrors `transactions.amount_minor`. Fening (1/100 BAM) is the smallest
-- unit; bigint covers ~9.2e18 so even a yearly mortgage budget fits with
-- room to spare. Numeric would force JS↔Postgres conversion through string,
-- and we already have a working bigint pipeline.
--
-- Why partial unique index?
-- ─────────────────────────
-- We want exactly ONE active budget per (user, category, period).
-- A regular unique would block deactivating + re-creating, which is the
-- common edit flow ("change limit" → deactivate old, insert new). The
-- `where active is true` predicate makes the constraint apply only to
-- the live row.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- user_owns_budgetable_category
-- ---------------------------------------------------------------------------
create or replace function public.user_owns_budgetable_category(p_category_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null
      and c.kind in ('expense', 'saving')
  );
$$;

revoke all on function public.user_owns_budgetable_category(uuid) from public;
grant execute on function public.user_owns_budgetable_category(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- budgets table
-- ---------------------------------------------------------------------------
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  currency      text not null default 'BAM' check (length(currency) = 3),
  period        text not null check (period in ('monthly', 'weekly')),
  active        boolean not null default true,
  -- When true, an unspent balance carries into the next period. The math
  -- itself lives in lib/queries/budgets.ts — we only persist the flag here.
  rollover      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Partial unique index: at most one active budget per (user, category, period).
-- Inactive rows accumulate without conflict.
create unique index idx_budgets_user_category_period_active
  on public.budgets (user_id, category_id, period)
  where active is true;

-- Hot-path index for the dashboard/listing query
-- (`where user_id = ? and active is true`).
create index idx_budgets_user_active
  on public.budgets (user_id)
  where active is true;

create trigger budgets_updated_at
  before update on public.budgets
  for each row execute function public.trigger_set_updated_at();


-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Defense-in-depth pattern (cf. categorization_rules in 00029):
--   - select / delete: scoped by user_id only.
--   - insert / update: also enforce that category_id is owned by the user
--     AND budgetable (expense | saving). Without this an attacker who
--     learned another user's category UUID could budget against it.
-- ---------------------------------------------------------------------------
alter table public.budgets enable row level security;

create policy "users select own budgets"
  on public.budgets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own budgets"
  on public.budgets
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_budgetable_category(category_id)
  );

create policy "users update own budgets"
  on public.budgets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_budgetable_category(category_id)
  );

create policy "users delete own budgets"
  on public.budgets
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


comment on table public.budgets is
  'Monthly/weekly spending budgets per category (F3-E1). One active row per (user, category, period); inactive rows kept for history.';

comment on column public.budgets.rollover is
  'If true, unspent balance carries into the next period. Computation lives in lib/queries/budgets.ts.';

notify pgrst, 'reload schema';
