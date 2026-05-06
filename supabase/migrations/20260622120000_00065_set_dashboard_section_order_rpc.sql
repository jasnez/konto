-- =============================================================================
-- 20260622120000_00065_set_dashboard_section_order_rpc.sql
--
-- RPC for persisting profiles.dashboard_section_order.
--
-- Why an RPC instead of supabase.from('profiles').update()?
-- ────────────────────────────────────────────────────────────────────────
-- Direct PATCH-via-PostgREST update was silently affecting 0 rows on
-- production for valid sessions: SELECT on the same column worked
-- (page reads the value), and the existing jsonb column
-- `onboarding_completed` (added in #00060, present in PostgREST's
-- schema cache for ages) updated fine via the same code path. The
-- delta was the new column from #00064 — the column-level write
-- schema cache had not refreshed even after `notify pgrst, 'reload
-- schema'`. PostgREST's RPC discovery is independent of the column
-- cache, so wrapping the write in a SECURITY DEFINER function bypasses
-- the cache lag entirely and gives explicit raise-on-not-found
-- semantics without a follow-up SELECT.
--
-- Safety: the function checks auth.uid() inside its body and only
-- updates the row whose id matches. SECURITY DEFINER is acceptable
-- because the only data path is "update my own row's preferences" —
-- there is no way to address another user's row.
-- =============================================================================

create or replace function public.set_dashboard_section_order(p_order text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.profiles
  set dashboard_section_order = jsonb_build_object('order', to_jsonb(p_order))
  where id = uid;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

comment on function public.set_dashboard_section_order(text[]) is
  'Persists per-user dashboard widget order. Sets profiles.dashboard_section_order to {"order": p_order}. Callable by authenticated sessions; only mutates auth.uid()''s own row.';

revoke all on function public.set_dashboard_section_order(text[]) from public;
grant execute on function public.set_dashboard_section_order(text[]) to authenticated;

notify pgrst, 'reload schema';
