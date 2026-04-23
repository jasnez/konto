-- =============================================================================
-- Fix UPDATE (soft-delete) on transactions when referenced rows are soft-deleted
-- =============================================================================
-- The WITH CHECK on "users update own transactions" used `user_owns_account`
-- and `user_owns_transaction`, which require *active* (non-deleted) target rows.
-- That blocked setting `deleted_at` on a transaction if its account was already
-- soft-deleted, or if split/transfer references pointed at already-deleted rows.
-- INSERT still uses the strict helpers so you cannot *create* new rows against
-- soft-deleted accounts. UPDATE uses relaxed "row exists and same user" checks.
-- =============================================================================

create or replace function public.user_owns_account_row(p_account_id uuid)
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
  );
$$;

create or replace function public.user_owns_transaction_row(p_tx_id uuid)
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
  );
$$;

drop policy if exists "users update own transactions" on public.transactions;

create policy "users update own transactions" on public.transactions
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_account_row(account_id)
    and (split_parent_id is null or public.user_owns_transaction_row(split_parent_id))
    and (transfer_pair_id is null or public.user_owns_transaction_row(transfer_pair_id))
  );
