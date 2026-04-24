-- import_batches: PDF/CSV import sessions (F2 bank statement flow).
-- Aligns with server action insert + UI status badges.
-- Wires existing transactions.import_batch_id to a real FK.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  storage_path text,
  checksum text not null, -- sha256 hex (64 chars), deduplication
  original_filename text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsing', 'ready', 'imported', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_import_batches_user_created
  on public.import_batches (user_id, created_at desc);

-- One logical upload per (user, file hash) at a time.
create unique index idx_import_batches_user_checksum
  on public.import_batches (user_id, checksum);

create trigger import_batches_updated_at
  before update on public.import_batches
  for each row execute function public.trigger_set_updated_at();

alter table public.import_batches enable row level security;

create policy "users manage own import_batches" on public.import_batches
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.transactions
  add constraint transactions_import_batch_id_fkey
  foreign key (import_batch_id) references public.import_batches (id) on delete set null;
