-- =============================================================================
-- Grant API roles access to public schema tables/sequences.
--
-- Symptom addressed:
--   "permission denied for table accounts" from PostgREST, which causes
--   /racuni list fetch to fail in production even with correct RLS policies.
--
-- We keep row-level protection in RLS; this migration only restores required
-- table/sequence privileges for API roles.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables
to authenticated, service_role;

alter default privileges in schema public
grant usage, select on sequences
to authenticated, service_role;
