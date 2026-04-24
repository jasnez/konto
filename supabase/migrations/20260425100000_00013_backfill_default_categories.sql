-- =============================================================================
-- Backfill default categories for users created before handle_new_user seeded
-- them, plus a safe RPC for the signed-in user only (no arbitrary user_id).
-- =============================================================================

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.insert_default_categories(u.id);
  end loop;
end $$;


create or replace function public.restore_default_categories_for_user()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  perform public.insert_default_categories(uid);
end;
$$;

comment on function public.restore_default_categories_for_user() is
  'Idempotent: inserts missing default taxonomy rows for auth.uid(). Callable by authenticated sessions only.';

revoke all on function public.restore_default_categories_for_user() from public;
grant execute on function public.restore_default_categories_for_user() to authenticated;
