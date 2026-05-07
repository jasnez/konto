-- =============================================================================
-- 20260625120000_00068_cron_execution_lock.sql
--
-- SE-11: server-side replay protection for Vercel Cron endpoints so a leaked
-- CRON_SECRET cannot be replayed to re-trigger daily jobs.
--
-- Why a server-side lock instead of the audit's "Bearer + timestamp" idea
-- ──────────────────────────────────────────────────────────────────────
-- The audit (PR #151, SE-11) suggested augmenting the Bearer header with a
-- timestamp and rejecting requests older than 60s. That requires the cron
-- *sender* to compute and attach the timestamp on each request — Vercel
-- Cron does not do that. It sends a fixed `Authorization: Bearer
-- ${CRON_SECRET}` header configured via env var, with no per-request
-- nonce or timestamp injection.
--
-- The practical Vercel-compatible alternative is a server-side execution
-- lock keyed on cron name. Both crons run daily; we record `last_run_at`
-- and reject any new attempt that arrives within ~22 hours of the last
-- successful acquisition. A leaked secret then yields at most one
-- successful invocation per 22h window — the legitimate run that
-- happened to claim the slot first. Replays return 409.
--
-- Architecture mirrors SE-10 (00067):
--   1. `public.cron_executions` ledger — RLS enabled, NO policies.
--   2. `public.acquire_cron_lock(text, int)` SECURITY DEFINER RPC — internal
--      infrastructure, not granted to anon/authenticated/service_role at
--      the API surface. Same per-role REVOKE lockdown trick (Supabase auto-
--      grants need explicit revokes; revoking from PUBLIC alone leaves the
--      auto-grants intact).
--
-- Failure-mode trade-off (lock is NOT released on cron failure)
-- ─────────────────────────────────────────────────────────────
-- If a legitimate cron acquires the lock and then errors mid-execution,
-- the lock stays held until the next 22h window. That blocks any next-
-- day legitimate run too — until ops manually clears the row:
--   DELETE FROM public.cron_executions WHERE cron_name = 'X';
--
-- Sentry (PR-2) catches the inner error → operator sees the failure and
-- knows to clear the lock. The alternative ("release on error") would
-- let an attacker DoS-via-failure-replay, which is worse. Since Vercel
-- does NOT auto-retry failed cron jobs, the false-positive frequency
-- here is effectively zero.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. cron_executions ledger
-- ---------------------------------------------------------------------------
create table public.cron_executions (
  cron_name   text primary key,
  last_run_at timestamptz not null default now()
);

alter table public.cron_executions enable row level security;
-- DELIBERATELY NO POLICIES — table is SECURITY DEFINER only.

comment on table public.cron_executions is
  'SE-11 replay protection: one row per Vercel Cron job, holds last successful '
  'acquisition timestamp. Read/written exclusively by acquire_cron_lock RPC. '
  'Manual unlock for ops: DELETE FROM cron_executions WHERE cron_name = ''X''.';


-- ---------------------------------------------------------------------------
-- 2. acquire_cron_lock — internal helper
-- ---------------------------------------------------------------------------
create or replace function public.acquire_cron_lock(
  p_cron_name text,
  p_min_interval_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_run timestamptz;
  v_cut      timestamptz;
begin
  -- Allow-list of cron names. Add new entries here when registering a new
  -- Vercel Cron — same safety rationale as the action enum on the
  -- check_anon_rate_limit_and_record helper (SE-10): a typo in a caller
  -- can't silently allocate a fresh "infinite-interval" bucket.
  if p_cron_name not in ('insights_nightly', 'post_due_installments') then
    raise exception 'INVALID_CRON_NAME';
  end if;

  -- Floor on interval prevents accidental "1-second lock" misconfigs that
  -- would defeat the protection.
  if p_min_interval_seconds < 60 then
    raise exception 'INVALID_INTERVAL';
  end if;

  v_cut := now() - (p_min_interval_seconds * interval '1 second');

  -- FOR UPDATE serializes concurrent acquire attempts on the same row so
  -- two replays cannot both pass the < v_cut check.
  select last_run_at into v_last_run
    from public.cron_executions
   where cron_name = p_cron_name
   for update;

  if v_last_run is not null and v_last_run > v_cut then
    -- Replay rejected — too soon since last acquisition.
    return false;
  end if;

  insert into public.cron_executions (cron_name, last_run_at)
  values (p_cron_name, now())
  on conflict (cron_name) do update set last_run_at = now();

  return true;
end;
$$;

-- Per-role REVOKE — Supabase auto-grants EXECUTE to anon/authenticated/
-- service_role on every public-schema function at creation time, so
-- revoking from PUBLIC alone is insufficient (verified during SE-10
-- integration test). Explicit per-role revokes lock this helper down to
-- postgres only; cron route handlers already use createAdminClient (which
-- runs as postgres via service_role JWT) so they retain access via the
-- function-owner path.
revoke all on function public.acquire_cron_lock(text, int) from public;
revoke all on function public.acquire_cron_lock(text, int) from anon;
revoke all on function public.acquire_cron_lock(text, int) from authenticated;

comment on function public.acquire_cron_lock(text, int) is
  'SE-11 replay protection: try to acquire a singleton lock for a Vercel Cron '
  'job. Returns true if the last successful acquisition was > p_min_interval_seconds '
  'ago (i.e., this caller wins the slot); returns false if a recent run is still '
  'within the window (i.e., this is a replay). SECURITY DEFINER, internal infra — '
  'not granted to anon/authenticated; only callable via postgres / service_role.';


notify pgrst, 'reload schema';
