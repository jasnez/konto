-- Allow authenticated users to append their own audit events (e.g. export_data).
-- Reads remain restricted to own rows via existing policy.

create policy "users insert own audit export" on public.audit_log
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and event_type = 'export_data'
  );
