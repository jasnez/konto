-- =============================================================================
-- FX rates cache table (EUR base) used by conversion library and edge refresh.
-- =============================================================================

create table if not exists public.fx_rates (
  date date not null,
  base text not null default 'EUR' check (char_length(base) = 3),
  quote text not null check (char_length(quote) = 3),
  rate numeric(20,10) not null check (rate > 0),
  source text not null default 'ecb'
    check (source in ('ecb','frankfurter','exchangerate_host','manual','currency_board')),
  fetched_at timestamptz not null default now(),
  primary key (date, base, quote)
);

create index if not exists idx_fx_quote_date on public.fx_rates (quote, date desc);

alter table public.fx_rates enable row level security;

create policy "anyone reads fx rates"
  on public.fx_rates
  for select
  using (true);

grant select on table public.fx_rates to anon, authenticated, service_role;
