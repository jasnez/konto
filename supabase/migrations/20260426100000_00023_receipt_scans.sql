-- Receipt scans + storage bucket for T1 (uslikaj racun MVP).
-- One row per uploaded image, plus extracted JSON from the LLM.
-- Links to a transaction once the user confirms the pre-filled form.

-- ──────────────────────────────────────────────────────────────────────────
-- Storage bucket
-- ──────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,                         -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Per-user RLS for storage.objects (bucket_id = 'receipts').
-- Paths are `{user_id}/{yyyy-mm}/{uuid}.{ext}` so folder[1] equals user_id.
create policy "users read own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users insert own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users update own receipts"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users delete own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ──────────────────────────────────────────────────────────────────────────
-- receipt_scans table — audit of every OCR attempt + extracted payload
-- ──────────────────────────────────────────────────────────────────────────
create table public.receipt_scans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null,                                 -- inside 'receipts' bucket
  mime           text not null,
  size_bytes     int  not null check (size_bytes > 0),
  status         text not null default 'uploaded'
                   check (status in ('uploaded','processing','extracted','error','cancelled')),
  extracted_json jsonb,
  extracted_at   timestamptz,
  error_message  text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger receipt_scans_updated_at
  before update on public.receipt_scans
  for each row execute function public.trigger_set_updated_at();

create index idx_receipt_scans_user    on public.receipt_scans(user_id, created_at desc);
create index idx_receipt_scans_tx      on public.receipt_scans(transaction_id);
create index idx_receipt_scans_daycnt  on public.receipt_scans(user_id, created_at);

alter table public.receipt_scans enable row level security;
create policy "users manage own receipt_scans" on public.receipt_scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- transactions.receipt_scan_id FK (reverse link for the detail view)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.transactions
  add column receipt_scan_id uuid references public.receipt_scans(id) on delete set null;

create index idx_transactions_receipt on public.transactions(receipt_scan_id)
  where receipt_scan_id is not null;

-- ──────────────────────────────────────────────────────────────────────────
-- Extend `source` enum with 'import_receipt'
-- ──────────────────────────────────────────────────────────────────────────
alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in (
    'manual','import_pdf','import_csv','import_xlsx',
    'quick_add','voice','recurring','split','import_receipt'
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- Rate-limit helper: returns daily scan count for the calling user.
-- Used by server actions to enforce 20 scans / user / day.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.count_receipt_scans_today()
returns int
language sql
security invoker
stable
as $$
  select count(*)::int
  from public.receipt_scans
  where user_id = auth.uid()
    and created_at >= date_trunc('day', now() at time zone 'UTC');
$$;

grant execute on function public.count_receipt_scans_today() to authenticated;
