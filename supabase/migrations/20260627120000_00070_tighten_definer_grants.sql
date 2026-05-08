-- =============================================================================
-- 20260627120000_00070_tighten_definer_grants.sql
--
-- S.1 (Supabase architecture audit 2026-05-08): tighten ACL on write-heavy
-- SECURITY DEFINER functions.
--
-- Rationale: Supabase auto-grants EXECUTE on every public-schema function to
-- `public`, `anon`, `authenticated`, and `service_role` at creation time.
-- `REVOKE EXECUTE … FROM public` alone does not strip direct grants on the
-- named roles; explicit per-role revokes are required to truly lock the
-- function down. See `docs/decisions/0004-security-definer-grants.md`.
--
-- This migration is **idempotent** — re-running it has no effect because
-- REVOKE is a no-op when the privilege isn't held, and GRANT is a no-op when
-- it already is.
--
-- Behaviour change: NONE.  Each function below already requires `auth.uid()`
-- to be non-null internally, so anon callers were already getting an
-- UNAUTHORIZED error.  This migration closes the defense-in-depth gap by
-- ensuring anon can't even invoke the function at the ACL layer in the first
-- place.
--
-- NOT covered by this migration (intentional, low risk):
--   - Read-only DEFINER RPCs (get_monthly_summary, get_current_period_spent,
--     get_period_spent_for_category, get_spending_by_category,
--     get_recurring_with_history, count_receipt_scans_today,
--     get_account_balance_history, search_merchants).
--     They have the same internal `auth.uid()` gate; can be tightened in a
--     follow-up if risk model shifts.
--   - Trigger functions (no REST/RPC surface).
--   - 00067 + 00068 functions (already follow the canonical pattern).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. create_transfer_pair (latest 17-arg signature, established in 00040
--    transfer_pair_symmetry; SECURITY DEFINER set in 00041 for DL-2 fix).
--    Currently has GRANT but no REVOKE — anon-callable surface.
-- ---------------------------------------------------------------------------
revoke all on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
) from public;
revoke all on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
) from anon;
revoke all on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
) from authenticated;
grant execute on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. convert_transaction_to_transfer (00049). Currently has GRANT but no
--    REVOKE — anon-callable surface.
-- ---------------------------------------------------------------------------
revoke all on function public.convert_transaction_to_transfer(uuid, uuid) from public;
revoke all on function public.convert_transaction_to_transfer(uuid, uuid) from anon;
revoke all on function public.convert_transaction_to_transfer(uuid, uuid) from authenticated;
grant execute on function public.convert_transaction_to_transfer(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. finalize_import_batch (latest sig from 00046:
--    uuid, jsonb, int).  Already has REVOKE FROM public + GRANT.  Add
--    explicit per-role revokes.
-- ---------------------------------------------------------------------------
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from public;
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from anon;
revoke all on function public.finalize_import_batch(uuid, jsonb, int) from authenticated;
grant execute on function public.finalize_import_batch(uuid, jsonb, int) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. confirm_recurring (00056).  Already has REVOKE FROM public + GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.confirm_recurring(jsonb) from public;
revoke all on function public.confirm_recurring(jsonb) from anon;
revoke all on function public.confirm_recurring(jsonb) from authenticated;
grant execute on function public.confirm_recurring(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. set_dashboard_section_order (00065 + 00066).  Already REVOKE FROM
--    public + GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.set_dashboard_section_order(text[]) from public;
revoke all on function public.set_dashboard_section_order(text[]) from anon;
revoke all on function public.set_dashboard_section_order(text[]) from authenticated;
grant execute on function public.set_dashboard_section_order(text[]) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. recompute_goal_from_account (00058).  Already REVOKE FROM public +
--    GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.recompute_goal_from_account(uuid) from public;
revoke all on function public.recompute_goal_from_account(uuid) from anon;
revoke all on function public.recompute_goal_from_account(uuid) from authenticated;
grant execute on function public.recompute_goal_from_account(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. restore_default_categories_for_user (00013 backfill_default_categories).
--    Already REVOKE FROM public + GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.restore_default_categories_for_user() from public;
revoke all on function public.restore_default_categories_for_user() from anon;
revoke all on function public.restore_default_categories_for_user() from authenticated;
grant execute on function public.restore_default_categories_for_user() to authenticated;


-- ---------------------------------------------------------------------------
-- 8. run_categorization_cascade (00029).  Already REVOKE FROM public +
--    GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.run_categorization_cascade(text, bigint) from public;
revoke all on function public.run_categorization_cascade(text, bigint) from anon;
revoke all on function public.run_categorization_cascade(text, bigint) from authenticated;
grant execute on function public.run_categorization_cascade(text, bigint) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. import_dedup_filter (00032).  Already REVOKE FROM public + GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.import_dedup_filter(uuid, jsonb) from public;
revoke all on function public.import_dedup_filter(uuid, jsonb) from anon;
revoke all on function public.import_dedup_filter(uuid, jsonb) from authenticated;
grant execute on function public.import_dedup_filter(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- 10. check_rate_limit_and_record (00033 / 00044 / 00052 — current sig is
--     uuid, text, int, int).  Already REVOKE FROM public + GRANT.
-- ---------------------------------------------------------------------------
revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from public;
revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from anon;
revoke all on function public.check_rate_limit_and_record(uuid, text, int, int) from authenticated;
grant execute on function public.check_rate_limit_and_record(uuid, text, int, int) to authenticated;


notify pgrst, 'reload schema';
