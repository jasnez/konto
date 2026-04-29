-- SE-8: close the direct-INSERT loophole on rate_limits.
--
-- check_rate_limit_and_record was SECURITY INVOKER, which required the
-- calling user to have INSERT permission on rate_limits.  That INSERT policy
-- also allowed authenticated clients to insert rows directly via the REST/JS
-- API, bypassing the advisory lock inside the RPC and breaking atomicity.
-- (Self-DoS only, but still unintended.)
--
-- Fix: elevate the function to SECURITY DEFINER so it can INSERT on behalf
-- of the caller without granting users direct INSERT access.  Drop the
-- now-unnecessary INSERT policy.

-- 1. Drop the INSERT policy — all writes must go through the RPC from now on.
drop policy "users insert own rate_limits" on public.rate_limits;

-- 2. Recreate the function as SECURITY DEFINER (body unchanged).
create or replace function public.check_rate_limit_and_record(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_cut   timestamptz;
  v_cnt   bigint;
  k1      int;
  k2      int;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_user_id is distinct from v_uid then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_action not in ('parse', 'upload') then
    raise exception 'INVALID_ACTION';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_PARAMS';
  end if;

  k1 := hashtext(v_uid::text);
  k2 := hashtext(p_action);
  perform pg_advisory_xact_lock(k1, k2);

  v_cut := now() - (p_window_seconds * interval '1 second');

  select count(*)::bigint into v_cnt
    from public.rate_limits
   where user_id = v_uid
     and action = p_action
     and created_at > v_cut;

  if v_cnt >= p_limit::bigint then
    return false;
  end if;

  insert into public.rate_limits (user_id, action)
  values (v_uid, p_action);

  return true;
end;
$$;

-- Re-apply grants (CREATE OR REPLACE preserves them, but stated explicitly
-- for clarity and migration idempotency).
revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from public;
grant execute on function public.check_rate_limit_and_record(uuid, text, int, int) to authenticated;

notify pgrst, 'reload schema';
