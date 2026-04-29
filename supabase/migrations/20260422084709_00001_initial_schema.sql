-- =============================================================================
-- Konto initial schema (Faza 0)
--
-- Scope of this migration (deliberately limited — later migrations add the
-- rest): extensions, shared helpers, profiles, accounts, categories,
-- transactions, audit_log. Defers merchants, merchant_aliases, import_batches,
-- user_corrections, categorization_rules, budgets, goals,
-- recurring_transactions, fx_rates, insights.
--
-- Source: docs/01-architecture.md §5.2 (schema) and §5.3 (default categories).
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================
-- pgcrypto and uuid-ossp are pre-installed in the "extensions" schema by
-- Supabase; we only need pg_trgm, and we put it in "extensions" too so it
-- doesn't pollute "public" (Supabase advisor flags extensions in public).
create extension if not exists pg_trgm with schema extensions;


-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Sets updated_at = now() on every UPDATE. Used by every mutable table.
create or replace function public.trigger_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- PROFILES
-- Extends auth.users with display + locale preferences. RLS: self-only.
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency text not null default 'BAM'
    check (base_currency in ('BAM','EUR','RSD','USD','GBP','CHF','MKD','HRK')),
  locale text not null default 'bs-BA'
    check (locale in ('bs-BA','sr-RS-Latn','sr-RS-Cyrl','hr-HR','mk-MK','en-US')),
  timezone text not null default 'Europe/Sarajevo',
  week_start smallint not null default 1 check (week_start in (0,1)),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.trigger_set_updated_at();

alter table public.profiles enable row level security;

-- auth.uid() is wrapped in (select ...) so the planner evaluates it once
-- per query (initplan) instead of per row. Documented Supabase pattern.
create policy "users read own profile" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users insert own profile" on public.profiles
  for insert with check ((select auth.uid()) = id);


-- =============================================================================
-- ACCOUNTS
-- Bank, cash, cards, Revolut, Wise, investments, loans.
-- =============================================================================
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in (
    'checking','savings','cash','credit_card',
    'revolut','wise','investment','loan','other'
  )),
  institution text,
  institution_slug text,
  account_number_last4 text,
  currency text not null check (char_length(currency) = 3),
  initial_balance_cents bigint not null default 0,
  current_balance_cents bigint not null default 0,
  icon text,
  color text,
  is_active boolean not null default true,
  include_in_net_worth boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_accounts_user on public.accounts(user_id) where deleted_at is null;

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.trigger_set_updated_at();

alter table public.accounts enable row level security;

create policy "users manage own accounts" on public.accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- =============================================================================
-- update_account_balance trigger (PLACEHOLDER)
-- Keeps accounts.current_balance_cents in sync with transactions. The actual
-- balance recomputation lands in a later migration once the transactions
-- table exists with stable semantics (transfers, splits, soft-deletes).
-- Attached to transactions at the bottom of this file so INSERT/UPDATE/DELETE
-- already route through it.
-- =============================================================================
create or replace function public.update_account_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- NOTE: balance trigger implementiran u migracijama 00013, 00035, 00036.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


-- =============================================================================
-- CATEGORIES
-- Per-user, hierarchical. Seeded at signup via insert_default_categories().
-- =============================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  kind text not null default 'expense'
    check (kind in ('expense','income','transfer','saving','investment')),
  is_system boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, slug)
);

create index idx_categories_user on public.categories(user_id) where deleted_at is null;
create index idx_categories_parent on public.categories(parent_id);

create trigger categories_updated_at before update on public.categories
  for each row execute function public.trigger_set_updated_at();

alter table public.categories enable row level security;

create policy "users manage own categories" on public.categories
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- =============================================================================
-- insert_default_categories(user_id)
-- Seeds the BiH default taxonomy from docs/01-architecture.md §5.3.
-- SECURITY DEFINER so it can insert on behalf of a user during the signup
-- trigger before any session exists. Idempotent via ON CONFLICT on (user_id,
-- slug) so re-running the trigger (or calling the function manually) is safe.
-- =============================================================================
create or replace function public.insert_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.categories (user_id, name, slug, icon, kind, is_system, sort_order)
  values
    -- Expense
    (p_user_id, 'Hrana i piće',        'hrana-i-pice',        '🍽️', 'expense',  true,  10),
    (p_user_id, 'Namirnice',           'namirnice',           '🛒', 'expense',  true,  20),
    (p_user_id, 'Stanovanje',          'stanovanje',          '🏠', 'expense',  true,  30),
    (p_user_id, 'Komunalije',          'komunalije',          '💡', 'expense',  true,  40),
    (p_user_id, 'Prevoz',              'prevoz',              '🚗', 'expense',  true,  50),
    (p_user_id, 'Gorivo',              'gorivo',              '⛽', 'expense',  true,  60),
    (p_user_id, 'Zdravlje',            'zdravlje',            '🏥', 'expense',  true,  70),
    (p_user_id, 'Odjeća i obuća',      'odjeca-i-obuca',      '👕', 'expense',  true,  80),
    (p_user_id, 'Zabava',              'zabava',              '🎬', 'expense',  true,  90),
    (p_user_id, 'Pretplate',           'pretplate',           '📱', 'expense',  true, 100),
    (p_user_id, 'Obrazovanje',         'obrazovanje',         '🎓', 'expense',  true, 110),
    (p_user_id, 'Djeca',               'djeca',               '🧸', 'expense',  true, 120),
    (p_user_id, 'Pokloni i donacije',  'pokloni-i-donacije',  '🎁', 'expense',  true, 130),
    (p_user_id, 'Putovanja',           'putovanja',           '✈️', 'expense',  true, 140),
    (p_user_id, 'Lična njega',         'licna-njega',         '💆', 'expense',  true, 150),
    (p_user_id, 'Kućni ljubimci',      'kucni-ljubimci',      '🐕', 'expense',  true, 160),
    (p_user_id, 'Bankarske naknade',   'bankarske-naknade',   '🏦', 'expense',  true, 170),
    (p_user_id, 'Porezi',              'porezi',              '📋', 'expense',  true, 180),
    (p_user_id, 'Ostalo',              'ostalo',              '📦', 'expense',  true, 190),
    -- Income
    (p_user_id, 'Plata',               'plata',               '💰', 'income',   true, 210),
    (p_user_id, 'Freelance',           'freelance',           '💼', 'income',   true, 220),
    (p_user_id, 'Bonus',               'bonus',               '🎉', 'income',   true, 230),
    (p_user_id, 'Kamata',              'kamata',              '📈', 'income',   true, 240),
    (p_user_id, 'Poklon',              'poklon',              '🎁', 'income',   true, 250),
    (p_user_id, 'Povrat',              'povrat',              '↩️', 'income',   true, 260),
    (p_user_id, 'Ostali prihodi',      'ostali-prihodi',      '💵', 'income',   true, 270),
    -- Transfer
    (p_user_id, 'Transferi',           'transferi',           '🔄', 'transfer', true, 310)
  on conflict (user_id, slug) do nothing;
end;
$$;


-- =============================================================================
-- handle_new_user trigger
-- Fires after a row is inserted into auth.users. Creates a matching profile
-- and seeds default categories. SECURITY DEFINER so it runs with sufficient
-- privileges during the auth signup flow.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1));

  perform public.insert_default_categories(new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- TRANSACTIONS
-- Heart of the system. Full shape per §5.2 so we don't need a reshape
-- migration once importers land.
-- =============================================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,

  -- Amounts (minor units, base = user's base currency snapshot)
  original_amount_cents bigint not null,
  original_currency text not null check (char_length(original_currency) = 3),
  base_amount_cents bigint not null,
  base_currency text not null check (char_length(base_currency) = 3),
  fx_rate numeric(20,10),
  fx_rate_date date,
  fx_stale boolean default false,

  -- Dates
  transaction_date date not null,
  posted_date date,
  value_date date,

  -- Merchant + description
  -- merchant_id FK is added in a later migration alongside the merchants table.
  merchant_raw text,
  merchant_id uuid,
  description text,
  notes text,

  -- Categorization
  category_id uuid references public.categories(id) on delete set null,
  category_confidence real check (category_confidence between 0 and 1),
  category_source text check (category_source in (
    'user','rule','alias','fuzzy','embedding','llm','default','imported'
  )),

  -- Transfer handling
  is_transfer boolean not null default false,
  transfer_pair_id uuid references public.transactions(id) on delete set null,

  -- Source tracking
  -- import_batch_id FK is added in a later migration alongside import_batches.
  source text not null check (source in (
    'manual','import_pdf','import_csv','import_xlsx',
    'quick_add','voice','recurring','split'
  )),
  import_batch_id uuid,
  split_parent_id uuid references public.transactions(id) on delete cascade,

  -- Flags
  is_pending boolean not null default false,
  is_reconciled boolean not null default false,
  is_excluded boolean not null default false,
  is_recurring boolean not null default false,
  recurring_group_id uuid,

  -- Dedup
  external_id text,
  dedup_hash text,

  -- Geolocation
  latitude numeric(10,7),
  longitude numeric(10,7),

  -- Meta
  tags text[] default '{}',
  attachments jsonb default '[]',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_tx_user_date on public.transactions(user_id, transaction_date desc)
  where deleted_at is null;
create index idx_tx_account on public.transactions(account_id, transaction_date desc)
  where deleted_at is null;
create index idx_tx_category on public.transactions(category_id) where deleted_at is null;
create index idx_tx_merchant on public.transactions(merchant_id) where deleted_at is null;
create index idx_tx_batch on public.transactions(import_batch_id);
create index idx_tx_dedup on public.transactions(user_id, dedup_hash) where deleted_at is null;
create index idx_tx_transfer_pair on public.transactions(transfer_pair_id);
create index idx_tx_merchant_raw_trgm on public.transactions
  using gin (merchant_raw extensions.gin_trgm_ops);

create trigger tx_updated_at before update on public.transactions
  for each row execute function public.trigger_set_updated_at();

create trigger tx_update_account_balance
  after insert or update or delete on public.transactions
  for each row execute function public.update_account_balance();

alter table public.transactions enable row level security;

create policy "users manage own transactions" on public.transactions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- =============================================================================
-- AUDIT LOG
-- Append-only record of sensitive actions. Writes go through service_role
-- (which bypasses RLS), so no INSERT policy is defined for end users.
-- =============================================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_log(user_id, created_at desc);
create index idx_audit_event on public.audit_log(event_type, created_at desc);

alter table public.audit_log enable row level security;

create policy "users read own audit" on public.audit_log
  for select using ((select auth.uid()) = user_id);


-- =============================================================================
-- NOTE: System category seed deliberately NOT run here.
--
-- We cannot seed system categories as global rows because the schema requires
-- every category to have a user_id. System categories are instead seeded
-- per-user by insert_default_categories(), invoked from the handle_new_user
-- trigger above. A future migration may introduce a truly shared
-- system_categories table if product decides to treat them as global.
-- =============================================================================
