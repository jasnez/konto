-- =============================================================================
-- 20260502140000_00031_user_corrections.sql
--
-- F2-E4-T3: learning loop — user corrections feed merchant_aliases.
--
-- The cascade (migration 00029) categorises rows on parse. When the user
-- overrides a non-deterministic suggestion (alias_fuzzy/history/llm/none) in
-- the import-review UI we record the correction here, and once the user has
-- corrected the same normalised description to the same category 3+ times
-- (without ambiguity) we materialise a `merchant_alias` so the next parse
-- catches it via the cheap `alias_exact` step.
--
-- Schema follows docs/01-architecture.md §5.2 (USER CORRECTIONS) verbatim,
-- with two pragmatic additions for the learning loop:
--
--   description_raw         — the merchant string the user corrected on,
--                             stored even when transaction_id is null
--                             (parsed_transactions overrides happen pre-
--                             import, so there is no transactions FK yet).
--   description_normalized  — `public.normalize_for_categorization(...)`
--                             result, used as the grouping key by
--                             `lib/categorization/learn.ts::maybeCreateAlias`.
--                             A dedicated index keeps the threshold check
--                             (3 same-category corrections → alias) O(log n).
--
-- These columns are nullable for fields where they don't make sense
-- (`amount`, `date`, ...). The CHECK constraint covers the full vocabulary
-- from the architecture doc; today's caller only writes 'category', but the
-- schema is forward-compatible with future correction kinds.
--
-- RLS: per-user read+insert (no update/delete — corrections are append-only
-- training signal). Defense-in-depth on top of the explicit user-id checks
-- in lib/categorization/learn.ts.
-- =============================================================================


create table public.user_corrections (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  transaction_id         uuid references public.transactions(id) on delete cascade,

  field                  text not null check (field in (
    'category','merchant','amount','date','description','tags','is_transfer'
  )),

  description_raw        text,
  description_normalized text,

  old_value              text,
  new_value              text,
  old_value_json         jsonb,
  new_value_json         jsonb,

  source_before          text,
  confidence_before      real check (
    confidence_before is null
    or (confidence_before >= 0 and confidence_before <= 1)
  ),

  created_at             timestamptz not null default now()
);

create index idx_corrections_user
  on public.user_corrections (user_id, created_at desc);

create index idx_corrections_field
  on public.user_corrections (user_id, field);

-- Hot path for `maybeCreateAlias`: "for this user + 'category' field +
-- normalised description, count corrections per new_value". The composite
-- index covers the WHERE + GROUP BY without touching the heap.
create index idx_corrections_norm_lookup
  on public.user_corrections (user_id, field, description_normalized, new_value)
  where description_normalized is not null;


alter table public.user_corrections enable row level security;

create policy "users read own corrections" on public.user_corrections
  for select using ((select auth.uid()) = user_id);

-- Insert-only on purpose: corrections are append-only training signal.
-- An update would silently rewrite history; a delete would skew the
-- 3-correction threshold. If we ever need to scrub a user's signal we
-- can do it as a privileged migration, not from app code.
create policy "users insert own corrections" on public.user_corrections
  for insert with check ((select auth.uid()) = user_id);


notify pgrst, 'reload schema';
