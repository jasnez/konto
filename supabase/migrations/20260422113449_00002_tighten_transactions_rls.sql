-- =============================================================================
-- Tighten transactions RLS (security hardening)
--
-- The original policy from 00001 (`users manage own transactions`) only checked
-- `auth.uid() = user_id` via USING and WITH CHECK. That allowed an authenticated
-- user to INSERT or UPDATE a transaction with their own user_id but another
-- user's account_id (victim account_id must be known — leaks can happen via
-- logs, screenshots, insider access, etc.). Once the update_account_balance
-- trigger becomes active (Epic 1.1), this would let an attacker move a victim's
-- balance.
--
-- This migration replaces the single ALL policy with command-specific policies
-- and a helper function that enforces ownership on account_id plus the
-- transaction-graph references (split_parent_id, transfer_pair_id) that land
-- in later epics but share the same threat model.
--
-- Verified reproduction before fix:
--   INSERT-1 (auth.uid() = user_id, account_id = victim) -> succeeded
--   INSERT-2 (auth.uid() <> user_id)                     -> blocked
-- After this migration, INSERT-1 is blocked as well.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Helper: user owns a non-deleted account
-- Marked STABLE so the planner can cache it within a statement; SECURITY INVOKER
-- because we want it to respect RLS of the caller (the anon/authenticated
-- role). search_path is pinned for defense in depth.
-- -----------------------------------------------------------------------------
create or replace function public.user_owns_account(p_account_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and a.user_id = (select auth.uid())
      and a.deleted_at is null
  );
$$;


-- -----------------------------------------------------------------------------
-- Helper: user owns a non-deleted transaction (used to validate
-- split_parent_id and transfer_pair_id references without widening RLS reads)
-- -----------------------------------------------------------------------------
create or replace function public.user_owns_transaction(p_tx_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.transactions t
    where t.id = p_tx_id
      and t.user_id = (select auth.uid())
      and t.deleted_at is null
  );
$$;


-- -----------------------------------------------------------------------------
-- Replace the catch-all policy with command-specific ones.
-- -----------------------------------------------------------------------------
drop policy if exists "users manage own transactions" on public.transactions;

create policy "users read own transactions" on public.transactions
  for select
  using ((select auth.uid()) = user_id);

create policy "users insert own transactions" on public.transactions
  for insert
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_account(account_id)
    and (split_parent_id is null or public.user_owns_transaction(split_parent_id))
    and (transfer_pair_id is null or public.user_owns_transaction(transfer_pair_id))
  );

create policy "users update own transactions" on public.transactions
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_account(account_id)
    and (split_parent_id is null or public.user_owns_transaction(split_parent_id))
    and (transfer_pair_id is null or public.user_owns_transaction(transfer_pair_id))
  );

create policy "users delete own transactions" on public.transactions
  for delete
  using ((select auth.uid()) = user_id);
