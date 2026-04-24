-- =============================================================================
-- 20260424141000_00014_audit_log_integrity.sql
--
-- Harden public.audit_log so its history can be trusted:
--
--   1. CHECK constraint on `event_type` — garbage-in protection. Without
--      this, a bug in service-role code (or a future compromise) could
--      scribble arbitrary strings into the table and erode the signal.
--   2. REVOKE UPDATE, DELETE from `authenticated` and `service_role`.
--      Migration 00005 granted broad DML on every public table and relied
--      purely on the absence of RLS policies to deny writes. Explicit
--      REVOKE is defense-in-depth: no matter what policy lands later,
--      these two privileges are off.
--   3. Immutability trigger. Belt-and-braces on (2): if any role is ever
--      (re)granted UPDATE/DELETE — or a superuser connects via the DB
--      console — the trigger still raises. Log rows are append-only.
--
-- Vocabulary (as of this migration)
-- ---------------------------------
--   export_data                 — user exported their data as JSON
--   account_deletion_requested  — user scheduled account deletion (30d)
--   account_deletion_cancelled  — user cancelled a scheduled deletion
--                                 (reserved for the cancel-via-email flow,
--                                 not emitted yet — adding it now so the
--                                 CHECK doesn't need another migration)
--   account_deleted             — hard-delete edge function ran
--
-- When a new event type is introduced, extend the CHECK in a new migration.
-- =============================================================================

alter table public.audit_log
  add constraint audit_log_event_type_check
  check (event_type in (
    'export_data',
    'account_deletion_requested',
    'account_deletion_cancelled',
    'account_deleted'
  ));

revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.audit_log from service_role;

-- Immutability trigger. Fires BEFORE so the statement never reaches the
-- table. Superuser sessions bypass triggers only with `session_replication_role`
-- explicitly set — leave that escape hatch for DBA recovery, document it in
-- the runbook.
create or replace function public.audit_log_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_log is append-only (tg_op=%)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_prevent_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_prevent_mutation();
