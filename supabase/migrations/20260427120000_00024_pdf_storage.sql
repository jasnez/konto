-- Bank statement PDFs (import pipeline). Private bucket, per-user RLS, 24h retention via pg_cron.
-- Enable pg_cron in Supabase: Database → Extensions → pg_cron (required for the cleanup job).

create extension if not exists pg_cron;

-- ──────────────────────────────────────────────────────────────────────────
-- Storage bucket
-- ──────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-statements',
  'bank-statements',
  false,
  10485760, -- 10 MB
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Per-user RLS. Paths: `{user_id}/...` so foldername(name)[1] is the user id.
create policy "Users can upload own PDFs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bank-statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bank-statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own PDFs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bank-statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Hourly cleanup: remove PDF metadata + blobs older than 24h (superuser bypasses RLS)
-- ──────────────────────────────────────────────────────────────────────────
do $cron$
declare
  job_id bigint;
begin
  select j.jobid into job_id
  from cron.job j
  where j.jobname = 'cleanup-old-statements'
  limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end
$cron$;

select cron.schedule(
  'cleanup-old-statements',
  '0 * * * *', -- every hour
  $$
  delete from storage.objects
  where bucket_id = 'bank-statements'
    and created_at < now() - interval '24 hours';
  $$
);
