-- =============================================================================
-- 20260424140000_00013_account_balance_trigger.sql
--
-- Replaces the placeholder `update_account_balance()` from migration 00001.
-- Keeps accounts.current_balance_cents = sum(original_amount_cents) over all
-- non-soft-deleted transactions for that account, in the account's currency.
--
-- Why a real implementation now
-- -----------------------------
-- The 00001 placeholder was a no-op, so every row in `accounts` that had at
-- least one transaction has been showing a stale balance. Several callers
-- read it directly:
--   * `get_monthly_summary` RPC (dashboard net-worth panel)
--   * /racuni list + detail pages
-- Downstream features (budgets, insights, imports) must not start before
-- this column is trustworthy.
--
-- Semantics
-- ---------
--  * Balance is in ACCOUNT CURRENCY. The app layer guarantees that every
--    transaction's `original_currency` matches the owning account's
--    `currency` (validated in the create/update actions). This trigger does
--    not re-check; a mismatch there is a bug upstream.
--  * Soft-deletes (deleted_at IS NOT NULL) are excluded.
--  * Transfers are two rows with opposite signs — one per account — so each
--    side recomputes independently.
--  * Splits are regular transactions with their own amounts, summed normally.
--  * `is_excluded` (a UX flag for reports/budgets) does NOT affect balance:
--    the money still moved.
--  * `initial_balance_cents` is NOT added to the sum. The app inserts an
--    opening-balance transaction at account creation whenever the initial is
--    non-zero (see `createAccount` in app/(app)/racuni/actions.ts), and that
--    transaction is counted like any other.
--
-- Implementation: full re-sum per affected account (not delta-update)
-- -------------------------------------------------------------------
-- Re-sum is O(n_tx_for_account) per write. For a PFM workload (O(1k) tx/acc)
-- this is negligible, and it buys correctness under every edge case:
--   * INSERT / DELETE of a transaction
--   * UPDATE changing amount
--   * UPDATE toggling deleted_at (soft-delete or restore)
--   * UPDATE moving a transaction between accounts (both sides recompute)
--   * Concurrent writes: the UPDATE on accounts acquires a per-row lock,
--     which serializes recomputes for the same account. Different accounts
--     proceed in parallel.
-- The `idx_tx_account` partial index already supports this sum efficiently.
-- =============================================================================

create or replace function public.update_account_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_account_ids uuid[];
begin
  -- Collect every account that may need a recompute.
  --   INSERT       -> NEW.account_id
  --   DELETE       -> OLD.account_id
  --   UPDATE (same account)      -> NEW.account_id
  --   UPDATE (moved to new acc)  -> both NEW.account_id and OLD.account_id
  if tg_op = 'INSERT' then
    v_account_ids := array[new.account_id];
  elsif tg_op = 'DELETE' then
    v_account_ids := array[old.account_id];
  else
    -- UPDATE
    if new.account_id is distinct from old.account_id then
      v_account_ids := array[new.account_id, old.account_id];
    else
      v_account_ids := array[new.account_id];
    end if;
  end if;

  update public.accounts a
  set current_balance_cents = coalesce((
    select sum(t.original_amount_cents)
    from public.transactions t
    where t.account_id = a.id
      and t.deleted_at is null
  ), 0)
  where a.id = any(v_account_ids);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- One-time backfill: re-align every account's current_balance_cents with
-- the new invariant. Safe to run repeatedly.
update public.accounts a
set current_balance_cents = coalesce((
  select sum(t.original_amount_cents)
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0)
where a.current_balance_cents is distinct from coalesce((
  select sum(t.original_amount_cents)
  from public.transactions t
  where t.account_id = a.id
    and t.deleted_at is null
), 0);
