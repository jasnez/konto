-- parsed_transactions: staging table for LLM-parsed PDF statement rows (F2-E2-T5).
-- Lives between a successful parse and the user-confirmed import into the
-- real `transactions` table. Each row here corresponds to a single candidate
-- transaction the user can accept, edit, or reject during review.
--
-- Also extends `import_batches` with parse metadata so the review UI can show
-- the LLM's confidence and any warnings without re-parsing.

-- ──────────────────────────────────────────────────────────────────────────
-- import_batches: parse metadata
-- ──────────────────────────────────────────────────────────────────────────
alter table public.import_batches
  add column if not exists transaction_count int,
  add column if not exists parse_confidence text
    check (parse_confidence is null or parse_confidence in ('high','medium','low')),
  add column if not exists parse_warnings jsonb;

-- ──────────────────────────────────────────────────────────────────────────
-- parsed_transactions: staging rows awaiting user review
-- ──────────────────────────────────────────────────────────────────────────
create table public.parsed_transactions (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.import_batches(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- LLM-extracted fields (all values come straight from gemini-2.5-flash-lite)
  transaction_date  date not null,
  -- Minor units (pfenig/cent). Signed: negative = odliv, positive = priliv.
  amount_minor      bigint not null,
  currency          text not null check (char_length(currency) = 3),
  raw_description   text not null,
  reference         text,
  -- Review state. Transitions: pending_review → accepted | rejected | imported.
  status            text not null default 'pending_review'
    check (status in ('pending_review','accepted','rejected','imported')),
  -- After the user imports, this FK links to the real transactions row.
  transaction_id    uuid references public.transactions(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_parsed_tx_batch    on public.parsed_transactions(batch_id);
create index idx_parsed_tx_user     on public.parsed_transactions(user_id, created_at desc);
create index idx_parsed_tx_status   on public.parsed_transactions(batch_id, status);

create trigger parsed_transactions_updated_at
  before update on public.parsed_transactions
  for each row execute function public.trigger_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- RLS: users see only their own staging rows
-- ──────────────────────────────────────────────────────────────────────────
alter table public.parsed_transactions enable row level security;

create policy "users manage own parsed_transactions" on public.parsed_transactions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- PostgREST schema reload so the new table is visible immediately
-- ──────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
