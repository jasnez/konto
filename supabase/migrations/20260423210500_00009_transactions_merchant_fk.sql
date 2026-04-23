-- Enforce merchant reference and enable PostgREST embeds (e.g. JSON export joins).
alter table public.transactions
  add constraint transactions_merchant_id_fkey
  foreign key (merchant_id) references public.merchants(id) on delete set null;
