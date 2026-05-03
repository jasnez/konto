-- =============================================================================
-- 20260614120000_00057_ignored_recurring_candidates.sql
--
-- F3-E2-T3: persist a user's "Ignoriši" decisions on suggested recurring
-- candidates. Without this the same false-positive (e.g. random Konzum
-- group with similar interval cadence) would keep popping back in the
-- /pretplate "Predloženo" section after every refresh.
--
-- The detector (lib/analytics/recurring-detection.ts) emits a stable
-- `groupKey` per candidate: either `merchant:<uuid>:<currency>` or
-- `desc:<normalized>:<currency>`. We persist that opaque string +
-- user_id, and the suggestion query left-joins this table to filter
-- ignored entries out.
--
-- Why a separate table (and not a flag on recurring_transactions)?
-- ─────────────────────────────────────────────────────────────────
-- An ignored candidate has, by definition, no row in
-- recurring_transactions. We need a place to record "user has seen
-- this and said no" that survives without ever materialising the
-- pretplata. A separate per-user table is the clean shape.
-- =============================================================================

create table public.ignored_recurring_candidates (
  user_id     uuid not null references auth.users(id) on delete cascade,
  group_key   text not null check (length(group_key) between 1 and 500),
  ignored_at  timestamptz not null default now(),
  primary key (user_id, group_key)
);

comment on table public.ignored_recurring_candidates is
  'F3-E2-T3: per-user dismissals of suggested recurring candidates. Keyed on the detector groupKey.';

-- The PK is already the optimal lookup index for the suggestion query
-- (filter on user_id, then EXCEPT on group_key). No additional index
-- needed.

alter table public.ignored_recurring_candidates enable row level security;

create policy "users select own ignored"
  on public.ignored_recurring_candidates
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own ignored"
  on public.ignored_recurring_candidates
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users delete own ignored"
  on public.ignored_recurring_candidates
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy — once dismissed, the only way to "un-dismiss" is
-- to delete the row. Saves us a column check on a never-needed
-- mutation path.

notify pgrst, 'reload schema';
