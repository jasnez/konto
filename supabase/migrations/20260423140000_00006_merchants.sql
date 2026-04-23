-- =============================================================================
-- Merchants + merchant_aliases (docs/01-architecture.md §5.2)
--
-- pg_trgm lives in schema extensions (see 00001_initial_schema).
-- =============================================================================

-- Defense-in-depth for FK targets (mirrors transactions RLS pattern).
create or replace function public.user_owns_category(p_category_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and c.user_id = (select auth.uid())
      and c.deleted_at is null
  );
$$;


-- =============================================================================
-- MERCHANTS
-- =============================================================================
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  display_name text not null,
  default_category_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  notes text,
  transaction_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, canonical_name)
);

create index idx_merchants_user on public.merchants(user_id) where deleted_at is null;
create index idx_merchants_trgm on public.merchants using gin (canonical_name extensions.gin_trgm_ops);

create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.trigger_set_updated_at();

alter table public.merchants enable row level security;

create policy "users manage own merchants" on public.merchants
  for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      default_category_id is null
      or public.user_owns_category(default_category_id)
    )
  );

create or replace function public.user_owns_merchant(p_merchant_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id
      and m.user_id = (select auth.uid())
  );
$$;


-- =============================================================================
-- MERCHANT_ALIASES
-- =============================================================================
create table public.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  pattern text not null,
  pattern_type text not null default 'contains'
    check (pattern_type in ('exact','contains','starts_with','regex')),
  created_at timestamptz not null default now()
);

create index idx_aliases_merchant on public.merchant_aliases(merchant_id);
create index idx_aliases_user on public.merchant_aliases(user_id);

alter table public.merchant_aliases enable row level security;

create policy "users manage own aliases" on public.merchant_aliases
  for all
  using (
    (select auth.uid()) = user_id
    and public.user_owns_merchant(merchant_id)
  )
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_merchant(merchant_id)
  );
