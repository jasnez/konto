-- =============================================================================
-- 20260609120000_00052_llm_categorization_cache.sql
--
-- CLOSEOUT-F2-T2: LLM kategorizacija fallback (step 5 of the cascade).
--
-- Adds:
--   1. public.llm_categorization_cache — per-user cache of (description, amount
--      bucket, currency) → category_id. Avoids paying for the same Gemini call
--      twice when a recurring merchant appears in multiple imports.
--   2. Extends rate_limits.action allow-list with 'llm_categorize'. The same
--      check_rate_limit_and_record RPC is reused; we only relax the input
--      check to accept the new value. Limit is 50 calls/day enforced by the
--      caller (lib/categorization/llm-categorize.ts) — DB stores the events.
--   3. pg_cron cleanup: drops expired cache rows nightly so the table never
--      grows past ~3 months of activity.
--
-- Why bucket the amount?
-- ──────────────────────
-- A merchant's ticket size varies day-to-day (e.g. groceries: 35 KM today,
-- 47 KM tomorrow). Caching on the exact amount would never hit. Bucketing
-- keeps cache hits high while still distinguishing genuinely different
-- categories ("BANKAR — 25 KM" coffee vs. "BANKAR — 250 KM" something else).
-- We hash to 50 KM buckets up to 1000 KM, then 500 KM buckets above (the
-- bucket function lives in TS to keep it portable across edge runtimes).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- llm_categorization_cache
-- ---------------------------------------------------------------------------
create table public.llm_categorization_cache (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  description_normalized   text not null,
  amount_bucket            int  not null,
  currency                 text not null check (length(currency) = 3),
  category_id              uuid references public.categories(id) on delete cascade,
  confidence               numeric(3,2) not null check (confidence between 0 and 1),
  expires_at               timestamptz not null,
  created_at               timestamptz not null default now(),

  -- One cache row per (user, normalised description, bucket, currency).
  -- ON CONFLICT lets the writer upsert (refresh expiry on hit).
  unique (user_id, description_normalized, amount_bucket, currency)
);

create index idx_llm_cache_lookup
  on public.llm_categorization_cache (user_id, description_normalized, amount_bucket, currency);

create index idx_llm_cache_expires
  on public.llm_categorization_cache (expires_at);

comment on table public.llm_categorization_cache is
  'Per-user cache of LLM-derived category assignments (CLOSEOUT-F2-T2). 90-day TTL, cleaned nightly by pg_cron.';

alter table public.llm_categorization_cache enable row level security;

create policy "users select own llm cache"
  on public.llm_categorization_cache
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own llm cache"
  on public.llm_categorization_cache
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (category_id is null or public.user_owns_category(category_id))
  );

create policy "users update own llm cache"
  on public.llm_categorization_cache
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (category_id is null or public.user_owns_category(category_id))
  );

create policy "users delete own llm cache"
  on public.llm_categorization_cache
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- Extend rate_limits.action to include 'llm_categorize'
--
-- The original check_rate_limit_and_record (00033 / 00044) only accepts
-- 'parse' and 'upload'. Drop and recreate the check so the new action is
-- valid; reuse the same SECURITY DEFINER function with a relaxed allow-list.
-- ---------------------------------------------------------------------------
alter table public.rate_limits drop constraint if exists rate_limits_action_check;
alter table public.rate_limits
  add constraint rate_limits_action_check
  check (action in ('parse', 'upload', 'llm_categorize'));

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
  if p_action not in ('parse', 'upload', 'llm_categorize') then
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

revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from public;
grant execute on function public.check_rate_limit_and_record(uuid, text, int, int) to authenticated;


-- ---------------------------------------------------------------------------
-- Nightly cleanup of expired cache rows
-- ---------------------------------------------------------------------------
do $cron$
declare
  job_id bigint;
begin
  select j.jobid into job_id
    from cron.job j
   where j.jobname = 'cleanup-expired-llm-categorization-cache'
   limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end
$cron$;

select cron.schedule(
  'cleanup-expired-llm-categorization-cache',
  '15 3 * * *', -- 03:15 daily (offset from rate_limits cleanup at :00)
  $job$
  delete from public.llm_categorization_cache
   where expires_at < now();
  $job$
);

notify pgrst, 'reload schema';
