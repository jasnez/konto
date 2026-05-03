-- =============================================================================
-- 20260615120000_00058_goals.sql
--
-- F3-E4-T1: savings goals.
--
-- Adds:
--   1. public.goals — one row per savings goal. Supports manual contribution
--      tracking OR automatic sync from a linked savings account.
--   2. public.check_goal_achieved() — BEFORE UPDATE trigger function that
--      auto-sets `achieved_at` when current >= target, and clears it if the
--      user later reduces `current_amount_cents` below target (e.g., partial
--      withdrawal). This keeps `achieved_at` always consistent with the
--      amounts — the UI uses `achieved_at IS NOT NULL` as the authoritative
--      "goal complete" flag.
--   3. public.recompute_goal_from_account(p_goal_id) — SECURITY INVOKER RPC
--      called from the `linkAccount` Server Action after account_id is set.
--      Syncs `current_amount_cents` from the linked account's live balance.
--      No-ops if the goal has no account_id, if the goal is not owned by the
--      caller, or if the linked account is not owned by the caller.
--   4. RLS policies (select / insert / update / delete) using the
--      `(select auth.uid())` initplan-cached pattern (matches the rest of
--      the schema — see budgets, recurring_transactions).
--
-- Why bigint for amounts?
-- ──────────────────────
-- Same rationale as budgets (00053): mirrors transactions.amount_minor,
-- fening precision, covers any realistic savings target.
--
-- Why not a hard FK on account_id preventing mismatched users?
-- ────────────────────────────────────────────────────────────
-- The FK only enforces referential integrity (account exists), NOT ownership.
-- Ownership is enforced in the `recompute_goal_from_account` RPC (caller
-- must own both goal and account) and in the `linkAccount` Server Action
-- which performs an explicit account ownership pre-check before writing.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- goals table
-- ---------------------------------------------------------------------------
create table public.goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  name                 text not null check (length(name) between 1 and 200),
  target_amount_cents  bigint not null check (target_amount_cents > 0),
  currency             text not null default 'BAM' check (length(currency) = 3),
  target_date          date,
  current_amount_cents bigint not null default 0 check (current_amount_cents >= 0),
  -- Optional: link to a savings account so current_amount_cents can be
  -- auto-synced from the account's live balance via recompute_goal_from_account.
  account_id           uuid references public.accounts(id) on delete set null,
  -- Emoji (e.g. "🏖️") or short slug chosen from a palette in the UI.
  icon                 text,
  -- Optional hex color (#RRGGBB) for the progress circle in the UI.
  color                text check (
    color is null
    or color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  active               boolean not null default true,
  -- Set automatically by the check_goal_achieved trigger when
  -- current_amount_cents >= target_amount_cents. Cleared if current dips
  -- back below target (e.g., withdrawal). Never updated by application code.
  achieved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Queries filter `active = true` on the listing page; this partial index
-- keeps those fast even when the user accumulates many archived/achieved goals.
create index idx_goals_user_active
  on public.goals (user_id, created_at desc)
  where active is true;

-- Linked-account lookup (used by recompute_goal_from_account).
create index idx_goals_account_id
  on public.goals (account_id)
  where account_id is not null;

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.trigger_set_updated_at();


-- ---------------------------------------------------------------------------
-- check_goal_achieved trigger
--
-- Fires BEFORE UPDATE so that `achieved_at` is part of the same row write
-- that changed `current_amount_cents`. The trigger only acts when
-- `current_amount_cents` or `target_amount_cents` actually changed (i.e.,
-- `pg_trigger_depth() = 0` is implicit since trigger_set_updated_at is the
-- only other trigger on this table and it doesn't recurse).
--
-- Edge cases handled:
--   - current crosses target from below → set achieved_at = now()
--   - current drops back below target (withdrawal) → clear achieved_at
--   - target raised above current → clear achieved_at
--   - re-setting achieved goal to target → no-op (already set)
-- ---------------------------------------------------------------------------
create or replace function public.check_goal_achieved()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Transitioning from NOT achieved → achieved
  if new.current_amount_cents >= new.target_amount_cents
     and old.achieved_at is null
  then
    new.achieved_at := now();

  -- Transitioning from achieved → NOT achieved (withdrawal or target raised)
  elsif new.current_amount_cents < new.target_amount_cents
        and new.achieved_at is not null
  then
    new.achieved_at := null;
  end if;

  return new;
end;
$$;

create trigger goals_check_achieved
  before update on public.goals
  for each row
  when (
    new.current_amount_cents is distinct from old.current_amount_cents
    or new.target_amount_cents is distinct from old.target_amount_cents
  )
  execute function public.check_goal_achieved();


-- ---------------------------------------------------------------------------
-- recompute_goal_from_account RPC
--
-- Syncs goal.current_amount_cents from the linked account's live balance.
-- Called from the linkAccount Server Action after account_id is set/changed.
-- Security: SECURITY INVOKER — runs with the calling user's privileges.
-- The function checks auth.uid() against BOTH the goal and the account, so
-- a user cannot recompute another user's goal or peek at another user's
-- account balance through this RPC.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_goal_from_account(p_goal_id uuid)
returns void
language plpgsql
security invoker
stable -- not quite (has side-effects), but keeps plan cache happy; overridden below
set search_path = public, pg_temp
as $$
declare
  v_account_id uuid;
  v_balance    bigint;
begin
  -- Resolve linked account (ownership enforced inline).
  select g.account_id
    into v_account_id
    from public.goals g
   where g.id       = p_goal_id
     and g.user_id  = (select auth.uid())
     and g.active   is true;

  -- Goal not found, not owned, not active, or no account linked → no-op.
  if not found or v_account_id is null then
    return;
  end if;

  -- Fetch the account balance (ownership enforced inline).
  select a.current_balance_cents
    into v_balance
    from public.accounts a
   where a.id      = v_account_id
     and a.user_id = (select auth.uid());

  if not found then
    return;
  end if;

  -- current_amount_cents cannot be negative per check constraint.
  update public.goals
     set current_amount_cents = greatest(0, v_balance)
   where id      = p_goal_id
     and user_id = (select auth.uid());
end;
$$;

-- Correct volatility: the function does write (UPDATE), so it must be volatile.
-- The `stable` above was overridden; explicit volatile is the default but
-- let's be unambiguous for documentation purposes.
alter function public.recompute_goal_from_account(uuid)
  volatile;

revoke all on function public.recompute_goal_from_account(uuid) from public;
grant execute on function public.recompute_goal_from_account(uuid) to authenticated;

revoke all on function public.check_goal_achieved() from public;


-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Defense-in-depth pattern (same as budgets, recurring_transactions):
--   - select / delete: scoped by user_id only.
--   - insert / update: user_id must equal auth.uid().
--     No extra helper function needed (unlike budgets whose category_id
--     ownership required a separate SQL guard) — account_id ownership is
--     enforced in the Server Action and the recompute RPC, not at RLS level,
--     because the RLS WITH CHECK cannot join across tables efficiently for
--     an OPTIONAL foreign key.
-- ---------------------------------------------------------------------------
alter table public.goals enable row level security;

create policy "users select own goals"
  on public.goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own goals"
  on public.goals
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own goals"
  on public.goals
  for update
  to authenticated
  using  ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete own goals"
  on public.goals
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


comment on table public.goals is
  'Savings goals (F3-E4). Each goal tracks a target amount and optional deadline. current_amount_cents is either incremented manually via addContribution or synced from a linked account via recompute_goal_from_account.';

comment on column public.goals.achieved_at is
  'Auto-set by check_goal_achieved trigger when current >= target. Cleared if current dips back below target. Never written by application code.';

comment on column public.goals.account_id is
  'Optional link to a savings account. When set, call recompute_goal_from_account() to sync current_amount_cents from the account live balance.';

notify pgrst, 'reload schema';
