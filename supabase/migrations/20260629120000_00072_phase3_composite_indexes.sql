-- MT-13: Composite indexes for Phase 3 list queries (default ORDER BY).
--
-- Existing indexes on budgets/goals/recurring_transactions/insights are
-- user_id-only or (user_id, active). Default list queries in lib/queries/*
-- ORDER BY one or two trailing columns; PostgreSQL has to do a "Sort"
-- step over the user_id-filtered rows. At 5 beta users this is invisible
-- (rowsets are tiny), but the index discipline matches the rest of the
-- schema and prevents a regression as data grows.
--
-- Each index is `if not exists` so this migration is replay-safe. No
-- backfill, no DROP, no destructive action — pure additive.
--
-- Reference query → index mapping:
--   budgets:       lib/queries/budgets.ts:106-107   .order('active' DESC).order('created_at' DESC)
--   goals:         lib/queries/goals.ts:112-113     .order('active' DESC).order('created_at' DESC)
--   recurring:     lib/queries/recurring.ts:97-98   .order('next_expected_date' ASC NULLS LAST).order('created_at' DESC)
--   insights:      lib/queries/insights.ts:142,144  .order('created_at' DESC)  (filtered by dismissed_at)
--
-- The `desc` in DDL is significant — Postgres can scan the index forward
-- for the matching ORDER BY direction without an extra Reverse step.

-- ── budgets ────────────────────────────────────────────────────────────
-- Covers /budzeti list. `active desc` first because the UI shows active
-- budgets at the top, then most-recently-created.
create index if not exists idx_budgets_user_active_created
  on public.budgets (user_id, active desc, created_at desc);

-- ── goals ──────────────────────────────────────────────────────────────
-- Covers /ciljevi list. Same shape as budgets — same UX pattern.
create index if not exists idx_goals_user_active_created
  on public.goals (user_id, active desc, created_at desc);

-- ── recurring_transactions ─────────────────────────────────────────────
-- Covers /pretplate list. `active` is the primary filter (we only show
-- active subscriptions); `next_expected_date NULLS LAST` puts dated
-- entries first; `created_at desc` is the tiebreak for entries with the
-- same next_expected_date.
create index if not exists idx_recurring_user_active_next_created
  on public.recurring_transactions (
    user_id,
    active,
    next_expected_date asc nulls last,
    created_at desc
  );

-- ── insights ───────────────────────────────────────────────────────────
-- Covers /uvidi list and the dashboard insight ribbon. Filter on
-- `dismissed_at` (live vs history view) then most-recent first.
create index if not exists idx_insights_user_dismissed_created
  on public.insights (user_id, dismissed_at, created_at desc);
