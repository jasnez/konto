-- =============================================================================
-- 20260623120000_00066_backfill_missing_profiles.sql
--
-- Backfill missing public.profiles rows + make set_dashboard_section_order
-- self-healing.
--
-- Background
-- ──────────
-- Diagnostic toast in #149 showed `code=P0001 | msg=PROFILE_NOT_FOUND`
-- when saving the dashboard order. The function raises this when the
-- UPDATE affects 0 rows, which means no public.profiles row exists for
-- the calling auth.uid() — even though the page renders normally
-- because pocetna/page.tsx falls back to email-based firstName when
-- profile is null.
--
-- Why a profile row could be missing: the on_auth_user_created trigger
-- inserts a profile on every new auth.users row, but only fires on
-- INSERT. If a user existed in auth.users before the trigger was added,
-- or the trigger transaction failed for some reason on their signup,
-- they'd be left without a profile row. The page's defensive `?.`
-- chains mask the issue for read paths, but any direct UPDATE WHERE
-- id = auth.uid() silently affects 0 rows.
--
-- Fix:
-- 1. INSERT a profile row for every auth.users without one. Default
--    display_name = email-prefix (matches handle_new_user logic).
-- 2. Replace set_dashboard_section_order with an UPSERT variant so
--    future bad state self-heals on first save.
-- =============================================================================

-- ── Step 1: backfill ────────────────────────────────────────────────────────
insert into public.profiles (id, display_name)
select u.id, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);

-- ── Step 2: make the RPC self-healing ───────────────────────────────────────
-- INSERT ... ON CONFLICT means: if a profile row exists, update only
-- the dashboard_section_order column. If it doesn't exist, create one
-- with sensible defaults (other columns inherit table-level defaults).
-- Eliminates the PROFILE_NOT_FOUND class of error entirely.
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

  insert into public.profiles (id, dashboard_section_order)
  values (uid, jsonb_build_object('order', to_jsonb(p_order)))
  on conflict (id) do update
    set dashboard_section_order = excluded.dashboard_section_order;
end;
$$;

comment on function public.set_dashboard_section_order(text[]) is
  'Persists per-user dashboard widget order. Self-healing: creates a profile row if one is missing, otherwise updates dashboard_section_order. Callable by authenticated sessions only.';

revoke all on function public.set_dashboard_section_order(text[]) from public;
grant execute on function public.set_dashboard_section_order(text[]) to authenticated;

notify pgrst, 'reload schema';
