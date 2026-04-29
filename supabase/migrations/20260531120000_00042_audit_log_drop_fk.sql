-- DL-4: Drop the FK on audit_log.user_id and restore the blanket-deny trigger.
--
-- Background: audit_log.user_id was declared as
--   references auth.users(id) on delete set null
-- which meant Postgres needed to UPDATE audit_log rows when a user is deleted.
-- To allow that internal UPDATE, migration 00034 added a carve-out to the
-- append-only trigger (any UPDATE that only nullifies user_id is permitted).
--
-- Problem: the carve-out is wider than the FK mechanism — any session that
-- can execute an UPDATE matching the pattern (user_id: non-null → null, all
-- other columns unchanged) slips through.
--
-- Fix: drop the FK. The user_id UUID stays as an immutable historical
-- reference (an orphaned UUID is fine for audit purposes and is actually
-- preferable — we never lose the record of who did what). Restore the trigger
-- to blanket-deny all UPDATEs with no carve-outs.

-- 1. Drop the FK constraint (name follows Postgres default naming convention).
alter table public.audit_log
  drop constraint if exists audit_log_user_id_fkey;

-- 2. Restore the append-only trigger function — no carve-outs.
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

comment on function public.audit_log_prevent_mutation() is
  'BLOKIRA svaki UPDATE i DELETE na audit_log. Tablica je striktno append-only.';
