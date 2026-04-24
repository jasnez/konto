-- Review UI (F2-E3-T1): staging row metadata + statement period on batch.

alter table public.import_batches
  add column if not exists statement_period_start date,
  add column if not exists statement_period_end date;

alter table public.parsed_transactions
  add column if not exists selected_for_import boolean not null default true,
  add column if not exists parse_confidence text
    check (parse_confidence is null or parse_confidence in ('high','medium','low')),
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists merchant_id uuid references public.merchants(id) on delete set null;

create index if not exists idx_parsed_tx_category on public.parsed_transactions(category_id)
  where category_id is not null;

create index if not exists idx_parsed_tx_merchant on public.parsed_transactions(merchant_id)
  where merchant_id is not null;

notify pgrst, 'reload schema';
