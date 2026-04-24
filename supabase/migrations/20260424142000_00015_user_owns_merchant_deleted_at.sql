-- =============================================================================
-- 20260424142000_00015_user_owns_merchant_deleted_at.sql
--
-- Fix `user_owns_merchant` so it does not consider soft-deleted merchants.
--
-- The helper is used in merchant_aliases RLS (see migration 00006). Without
-- the `deleted_at is null` filter, a user can create an alias pointing at a
-- merchant they already deleted — reviving a ghost relationship. The
-- merchants table itself is not affected because its RLS uses direct
-- `auth.uid() = user_id` and does not go through this helper.
--
-- Same shape as `user_owns_category` from migration 00006.
-- =============================================================================

create or replace function public.user_owns_merchant(p_merchant_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id
      and m.user_id = (select auth.uid())
      and m.deleted_at is null
  );
$$;
