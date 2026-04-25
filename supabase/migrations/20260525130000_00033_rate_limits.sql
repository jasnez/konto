-- F2-E5-T2: rate limiting for import parse + upload (sliding window, DB-backed).
-- Requires pg_cron (see 00024_pdf_storage) for retention cleanup.

-- ---------------------------------------------------------------------------
-- rate_limits: append-only usage ledger (per user, per action, per try)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('parse', 'upload')),
  created_at timestamptz not null default now()
);

create index idx_rate_limits_user_action_created
  on public.rate_limits (user_id, action, created_at desc);

comment on table public.rate_limits is
  'Sliding-window counters for F2 import rate limits; rows older than 24h removed by pg_cron.';

alter table public.rate_limits enable row level security;

-- Read own rows (optional for debugging); enforcement is in RPC.
create policy "users read own rate_limits"
  on public.rate_limits
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users insert own rate_limits"
  on public.rate_limits
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Atomic check + optional insert (advisory xact lock prevents double-count)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit_and_record(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security invoker
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

revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from public;
grant execute on function public.check_rate_limit_and_record(uuid, text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Hourly cleanup: remove rows older than 24h (keeps the table small)
-- ---------------------------------------------------------------------------
do $cron$
declare
  job_id bigint;
begin
  select j.jobid into job_id
    from cron.job j
   where j.jobname = 'cleanup-old-rate-limits'
   limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end
$cron$;

select cron.schedule(
  'cleanup-old-rate-limits',
  '0 * * * *', -- every hour
  $job$
  delete from public.rate_limits
   where created_at < now() - interval '24 hours';
  $job$
);

notify pgrst, 'reload schema';
