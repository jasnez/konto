-- =============================================================================
-- 20260624120000_00067_anon_rate_limit_for_invite_preview.sql
--
-- SE-10: rate-limit `preview_invite_code` so the closed-beta invite list
-- can't be enumerated by an attacker who calls the RPC repeatedly.
--
-- Threat model
-- ────────────
-- `preview_invite_code` is anon-callable (signup form needs it before the
-- user has an account). Without rate limiting, an attacker can:
--   1. Spray candidate codes against the RPC → discover which are 'valid'.
--   2. Sign up with their own email + a stolen valid code → handle_new_user
--      consumes the invite atomically (no identity check beyond code).
--   3. Beta gating broken: stranger steals an invite intended for a friend.
--
-- The existing `check_rate_limit_and_record` helper (00033/00044) requires
-- `auth.uid()` and stores the bucket as a real user_id FK to auth.users.
-- That's a dead end for anonymous callers, so this migration introduces a
-- parallel, anon-friendly counterpart keyed on IP address.
--
-- Architecture
-- ────────────
--   1. `public.rate_limits_anon` — append-only ledger, RLS enabled with NO
--      policies. Only SECURITY DEFINER functions reach it.
--   2. `public.check_anon_rate_limit_and_record(text, text, int, int)` —
--      generic helper, NOT granted to anon/authenticated. Internal infra
--      callable only by other SECURITY DEFINER functions running as the
--      function owner.
--   3. `public.preview_invite_code(text)` — replaced. Pulls caller IP from
--      the PostgREST `request.headers` GUC, rate-limits via the helper,
--      then runs the original lookup. Raises `RATE_LIMITED` (errcode
--      P0001) when the bucket is exhausted.
--   4. Daily pg_cron cleanup of rows older than 24h, mirroring the existing
--      rate_limits cleanup job.
--
-- Tunables (chosen for the closed-beta scale, easy to tweak in a follow-up
-- migration once we have real-world signal):
--   - 30 lookups per minute per source IP (legitimate signup makes ~2-3,
--     so 30 gives 10x headroom; catches automated enumeration immediately).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. rate_limits_anon ledger
-- ---------------------------------------------------------------------------
create table public.rate_limits_anon (
  id         uuid primary key default gen_random_uuid(),
  -- IP address (preferred) or 'global-fallback' when header extraction
  -- fails. Free-form text so the schema doesn't lock us into a specific
  -- bucketing scheme; inserts are gated by the helper RPC's check on
  -- p_action so callers can't store arbitrary garbage.
  bucket_key text not null,
  action     text not null,
  created_at timestamptz not null default now()
);

create index idx_rate_limits_anon_bucket_action_created
  on public.rate_limits_anon (bucket_key, action, created_at desc);

alter table public.rate_limits_anon enable row level security;
-- DELIBERATELY NO POLICIES — table is SECURITY DEFINER only.

comment on table public.rate_limits_anon is
  'Anon-callable sliding-window rate limit ledger keyed on IP. SE-10. '
  'Read/written exclusively by SECURITY DEFINER RPCs (e.g. preview_invite_code). '
  'pg_cron deletes rows older than 24h hourly.';


-- ---------------------------------------------------------------------------
-- 2. check_anon_rate_limit_and_record — internal helper
-- ---------------------------------------------------------------------------
create or replace function public.check_anon_rate_limit_and_record(
  p_bucket_key text,
  p_action text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cut timestamptz;
  v_cnt bigint;
  k1    int;
  k2    int;
begin
  if p_bucket_key is null or length(p_bucket_key) = 0 then
    raise exception 'INVALID_BUCKET';
  end if;
  -- Action allow-list. Add new actions explicitly so a typo in a caller
  -- can't silently allocate a fresh bucket name with no monitoring.
  if p_action not in ('invite_preview') then
    raise exception 'INVALID_ACTION';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_PARAMS';
  end if;

  -- Advisory xact lock: serializes count + insert for the same
  -- (bucket, action) pair so two concurrent requests can't both pass
  -- the count check and exceed the limit.
  k1 := hashtext(p_bucket_key);
  k2 := hashtext(p_action);
  perform pg_advisory_xact_lock(k1, k2);

  v_cut := now() - (p_window_seconds * interval '1 second');

  select count(*)::bigint into v_cnt
    from public.rate_limits_anon
   where bucket_key = p_bucket_key
     and action = p_action
     and created_at > v_cut;

  if v_cnt >= p_limit::bigint then
    return false;
  end if;

  insert into public.rate_limits_anon (bucket_key, action)
  values (p_bucket_key, p_action);

  return true;
end;
$$;

-- Internal infra: NOT granted to anon/authenticated. Only callable by
-- other SECURITY DEFINER functions running as the function owner
-- (postgres). Supabase auto-grants EXECUTE to anon/authenticated/
-- service_role on every public-schema function at creation time, so
-- revoking from PUBLIC alone is insufficient — explicit per-role
-- revokes are required to truly lock the helper down.
revoke all on function public.check_anon_rate_limit_and_record(text, text, int, int) from public;
revoke all on function public.check_anon_rate_limit_and_record(text, text, int, int) from anon;
revoke all on function public.check_anon_rate_limit_and_record(text, text, int, int) from authenticated;

comment on function public.check_anon_rate_limit_and_record(text, text, int, int) is
  'Anon-callable sliding-window rate limit. SECURITY DEFINER. Internal infrastructure — '
  'not granted to anon/authenticated; only callable by other SECURITY DEFINER fns. '
  'p_action must be in the allow-list; p_bucket_key is typically the caller IP.';


-- ---------------------------------------------------------------------------
-- 3. Replace preview_invite_code — adds rate-limit gate at the top
-- ---------------------------------------------------------------------------
create or replace function public.preview_invite_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used_at    timestamptz;
  v_expires_at timestamptz;
  v_ip         text;
  v_allowed    boolean;
begin
  -- SE-10: extract caller IP from PostgREST-forwarded headers. Try
  -- `cf-connecting-ip` first (Supabase API is behind Cloudflare → this is
  -- the trusted real client IP), then the first entry of `x-forwarded-for`,
  -- then a global-fallback bucket if all extraction fails. The fallback is
  -- a small DoS surface for closed-beta scale (5 users) but worth keeping
  -- so the RPC degrades gracefully if Supabase ever changes header
  -- forwarding.
  begin
    v_ip := coalesce(
      current_setting('request.headers', true)::jsonb->>'cf-connecting-ip',
      split_part(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ',', 1),
      'global-fallback'
    );
  exception when others then
    v_ip := 'global-fallback';
  end;

  -- 30 lookups / minute / source. Legitimate signup makes ~2-3 calls
  -- (one in InviteStep, one re-check in sendSignupOtp). 30 is 10x
  -- headroom; catches automated enumeration immediately.
  v_allowed := public.check_anon_rate_limit_and_record(v_ip, 'invite_preview', 30, 60);
  if not v_allowed then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- Original body preserved below. Returning early on bad input shape
  -- still costs one rate-limit slot (intentional — discourages spraying
  -- empty / malformed lookups).
  if p_code is null or length(p_code) <> 8 then
    return 'invalid';
  end if;

  select used_at, expires_at into v_used_at, v_expires_at
  from public.invite_codes
  where code = upper(p_code);

  if not found then
    return 'invalid';
  end if;
  if v_used_at is not null then
    return 'used';
  end if;
  if v_expires_at <= now() then
    return 'expired';
  end if;
  return 'valid';
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Hourly pg_cron cleanup of stale rows (mirrors existing pattern)
-- ---------------------------------------------------------------------------
do $cron$
declare
  job_id bigint;
begin
  select j.jobid into job_id
    from cron.job j
   where j.jobname = 'cleanup-old-rate-limits-anon'
   limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end
$cron$;

select cron.schedule(
  'cleanup-old-rate-limits-anon',
  '0 * * * *',
  $job$
  delete from public.rate_limits_anon
   where created_at < now() - interval '24 hours';
  $job$
);


notify pgrst, 'reload schema';
