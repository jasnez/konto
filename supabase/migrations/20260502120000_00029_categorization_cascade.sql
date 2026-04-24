-- =============================================================================
-- 20260502120000_00029_categorization_cascade.sql
--
-- F2-E4-T1: per-transaction categorization cascade.
--
-- Adds:
--   1. public.categorization_rules — user-defined rules (docs/01-architecture.md
--      §5.2). Rules are matched first by the cascade, with the highest
--      priority winning. Pattern matching supports 'exact', 'contains', and
--      'regex' on merchant strings; amount-window and amount-sign filters
--      compose with the merchant pattern (all conditions ANDed).
--   2. public.normalize_for_categorization(text) — shared text normaliser
--      used by both alias matching and the cascade RPC. Strips diacritics
--      via `unaccent` is intentionally NOT done (we don't have unaccent
--      installed and adding another extension is out of scope); we lowercase,
--      collapse whitespace, and strip punctuation only. The TS side mirrors
--      this function.
--   3. public.run_categorization_cascade(p_description, p_amount_minor)
--      — single-round-trip cascade: rule → alias_exact → alias_fuzzy →
--      history → none. Returns a jsonb shape compatible with
--      lib/categorization/cascade.ts (CategorizationResult). LLM fallback is
--      deliberately *not* implemented here (deferred per F2-E4-T1 spec).
--   4. Trigram GIN index on merchant_aliases.pattern so the fuzzy step
--      is O(log n) instead of a full table scan. Mirrors merchants and
--      transactions.merchant_raw indexes.
--
-- Why one RPC instead of multiple round-trips
-- --------------------------------------------
-- The acceptance criterion is "<100ms for one transaction". Each Supabase
-- round-trip from the Vercel function is ~10–25ms even on a warm pool, so
-- four sequential round-trips would blow the budget on a single transaction
-- and devastate it during a 50-row import. Doing the cascade in one
-- plpgsql call keeps it to a single round-trip and lets the planner short-
-- circuit on the first match.
--
-- pg_trgm extension lives in schema `extensions` (00001_initial_schema).
-- We add `extensions` to search_path so `similarity()` is callable
-- unqualified — same pattern as `search_merchants` (migration 00007).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- normalize_for_categorization
--
-- Shared lowercase + punctuation strip + whitespace collapse helper. Used by
-- the cascade for "exact alias match after normalisation" so a stored alias
-- of "Konzum BL" matches an LLM-produced description of "konzum, bl.".
-- Mirrored in lib/categorization/cascade.ts (normalizeDescription) so unit
-- tests can assert on the TS side without spinning up Postgres.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_for_categorization(p_input text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(p_input, '')),
        -- Replace anything that is not a letter, digit, or whitespace with a
        -- single space. The `[:alpha:]` class covers Unicode letters in the
        -- C locale build that Supabase uses.
        '[^[:alnum:][:space:]]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;


-- ---------------------------------------------------------------------------
-- categorization_rules
-- ---------------------------------------------------------------------------
create table public.categorization_rules (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  name                        text,
  priority                    int  not null default 0,

  -- Match conditions (all ANDed)
  match_merchant_pattern      text,
  match_merchant_pattern_type text check (match_merchant_pattern_type in ('exact','contains','regex')),
  match_description_pattern   text,
  match_account_id            uuid references public.accounts(id) on delete cascade,
  match_amount_min_cents      bigint,
  match_amount_max_cents      bigint,
  match_amount_sign           text check (match_amount_sign in ('positive','negative','any')),

  -- Actions
  set_category_id             uuid references public.categories(id) on delete cascade,
  set_merchant_id             uuid references public.merchants(id)  on delete set null,
  set_tags                    text[],
  set_is_transfer             boolean,
  set_is_excluded             boolean,

  is_active                   boolean not null default true,
  applied_count               int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_rules_user_priority
  on public.categorization_rules (user_id, priority desc, created_at)
  where is_active = true;

create trigger rules_updated_at
  before update on public.categorization_rules
  for each row execute function public.trigger_set_updated_at();

alter table public.categorization_rules enable row level security;

-- Defense-in-depth: same shape as the merchants policy. Rules can only
-- target categories/accounts/merchants the user owns. Otherwise a leak of
-- another user's category_id would let a crafted INSERT bind to it.
create policy "users manage own rules" on public.categorization_rules
  for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (set_category_id is null or public.user_owns_category(set_category_id))
    and (set_merchant_id is null or public.user_owns_merchant(set_merchant_id))
    and (match_account_id is null or public.user_owns_account(match_account_id))
  );


-- ---------------------------------------------------------------------------
-- merchant_aliases: trigram index for fuzzy match
--
-- The cascade's step 3 issues `similarity(pattern, ?) > 0.6 order by score
-- desc limit 1`. Without a trigram GIN index this scans the whole alias
-- table per call, blowing the perf budget at scale. Idempotent: matches the
-- existing `idx_merchants_trgm` pattern.
-- ---------------------------------------------------------------------------
create index if not exists idx_aliases_pattern_trgm
  on public.merchant_aliases using gin (pattern extensions.gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- run_categorization_cascade
--
-- Single-round-trip cascade. Returns:
--   { merchant_id?, category_id?, source, confidence, rule_id? }
--
-- Order:
--   1. Active categorization_rules sorted by priority desc, then created_at
--      asc (oldest wins ties — predictable ordering).
--   2. Exact alias match (literal pattern after normalisation, or pattern_type
--      = 'exact' case-insensitive equality).
--   3. Fuzzy alias match via pg_trgm. Threshold split: candidates appear at
--      similarity > 0.6 but only fire when the top score >= 0.75. The
--      0.6–0.75 band intentionally falls through (per F2-E4-T1 spec).
--   4. User history: trigram match against the user's last 1000 categorised
--      transactions (merchant_raw). Confidence linearly interpolates from
--      0.6 at score 0.7 → 0.8 at score 1.0.
--
-- LLM fallback (step 5 in the architecture) is deliberately not handled
-- here — it lives in lib/categorization/cascade.ts and is gated by
-- amountMinor > 50 KM per the spec. The plpgsql function returns
-- {source: 'none'} so the TS layer can decide whether to escalate.
--
-- Auth: uses auth.uid(). Callers cannot pass a foreign user_id (RLS would
-- block reads anyway, but this is the explicit guarantee).
-- ---------------------------------------------------------------------------
create or replace function public.run_categorization_cascade(
  p_description  text,
  p_amount_minor bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_desc           text;
  v_desc_norm      text;
  v_abs_amount     bigint;
  v_rule           record;
  v_alias_exact    record;
  v_alias_fuzzy    record;
  v_history        record;
  v_history_conf   numeric;
  v_pattern_match  boolean;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  v_desc := btrim(coalesce(p_description, ''));
  if v_desc = '' then
    return jsonb_build_object('source', 'none', 'confidence', 0);
  end if;

  v_desc_norm  := public.normalize_for_categorization(v_desc);
  v_abs_amount := abs(coalesce(p_amount_minor, 0));

  -- ------------------------------------------------------------------------
  -- Step 1: explicit user rules
  -- ------------------------------------------------------------------------
  for v_rule in
    select id,
           match_merchant_pattern,
           coalesce(match_merchant_pattern_type, 'contains') as pattern_type,
           match_amount_min_cents,
           match_amount_max_cents,
           coalesce(match_amount_sign, 'any')                as amount_sign,
           set_category_id,
           set_merchant_id
    from public.categorization_rules
    where user_id   = v_user_id
      and is_active = true
      and match_merchant_pattern is not null
      and length(btrim(match_merchant_pattern)) > 0
    order by priority desc, created_at asc
  loop
    -- Amount window
    if v_rule.match_amount_min_cents is not null
       and v_abs_amount < v_rule.match_amount_min_cents then
      continue;
    end if;
    if v_rule.match_amount_max_cents is not null
       and v_abs_amount > v_rule.match_amount_max_cents then
      continue;
    end if;
    -- Sign filter (positive = inflow, negative = outflow, any = no filter)
    if v_rule.amount_sign = 'positive' and coalesce(p_amount_minor, 0) <= 0 then
      continue;
    end if;
    if v_rule.amount_sign = 'negative' and coalesce(p_amount_minor, 0) >= 0 then
      continue;
    end if;

    v_pattern_match := false;
    if v_rule.pattern_type = 'exact' then
      v_pattern_match := upper(v_desc) = upper(v_rule.match_merchant_pattern);
    elsif v_rule.pattern_type = 'regex' then
      -- Bad regexes raise — swallow and skip the rule rather than failing
      -- the entire cascade.
      begin
        v_pattern_match := v_desc ~* v_rule.match_merchant_pattern;
      exception when others then
        v_pattern_match := false;
      end;
    else  -- 'contains'
      v_pattern_match := position(upper(v_rule.match_merchant_pattern) in upper(v_desc)) > 0;
    end if;

    if v_pattern_match then
      return jsonb_build_object(
        'merchant_id', v_rule.set_merchant_id,
        'category_id', v_rule.set_category_id,
        'source',      'rule',
        'confidence',  1.0,
        'rule_id',     v_rule.id
      );
    end if;
  end loop;

  -- ------------------------------------------------------------------------
  -- Step 2: exact alias match (case-insensitive after normalisation)
  --
  -- Pattern_type = 'exact' on the alias OR a normalised match against any
  -- alias pattern (covers user-entered patterns with stray punctuation).
  -- ------------------------------------------------------------------------
  select ma.merchant_id,
         m.default_category_id
    into v_alias_exact
    from public.merchant_aliases ma
    join public.merchants m
      on m.id = ma.merchant_id
     and m.deleted_at is null
   where ma.user_id = v_user_id
     and (
       (ma.pattern_type = 'exact' and upper(ma.pattern) = upper(v_desc))
       or public.normalize_for_categorization(ma.pattern) = v_desc_norm
     )
   limit 1;

  if found then
    return jsonb_build_object(
      'merchant_id', v_alias_exact.merchant_id,
      'category_id', v_alias_exact.default_category_id,
      'source',      'alias_exact',
      'confidence',  1.0
    );
  end if;

  -- ------------------------------------------------------------------------
  -- Step 3: fuzzy alias match (pg_trgm)
  -- ------------------------------------------------------------------------
  select ma.merchant_id,
         m.default_category_id,
         similarity(ma.pattern, v_desc) as score
    into v_alias_fuzzy
    from public.merchant_aliases ma
    join public.merchants m
      on m.id = ma.merchant_id
     and m.deleted_at is null
   where ma.user_id = v_user_id
     and similarity(ma.pattern, v_desc) > 0.6
   order by similarity(ma.pattern, v_desc) desc
   limit 1;

  if found and v_alias_fuzzy.score >= 0.75 then
    return jsonb_build_object(
      'merchant_id', v_alias_fuzzy.merchant_id,
      'category_id', v_alias_fuzzy.default_category_id,
      'source',      'alias_fuzzy',
      'confidence',  round(v_alias_fuzzy.score::numeric, 4)
    );
  end if;

  -- ------------------------------------------------------------------------
  -- Step 4: user history (last 1000 categorised transactions)
  --
  -- Confidence interpolates 0.7 → 0.6 conf, 1.0 → 0.8 conf:
  --   conf = 0.6 + (score - 0.7) * (0.8 - 0.6) / (1.0 - 0.7)
  -- ------------------------------------------------------------------------
  with recent as (
    select t.merchant_id,
           t.category_id,
           t.merchant_raw,
           similarity(t.merchant_raw, v_desc) as score
      from public.transactions t
     where t.user_id      = v_user_id
       and t.deleted_at   is null
       and t.category_id  is not null
       and t.merchant_raw is not null
       and length(btrim(t.merchant_raw)) > 0
     order by t.transaction_date desc, t.id desc
     limit 1000
  )
  select merchant_id, category_id, score
    into v_history
    from recent
   where score > 0.7
   order by score desc
   limit 1;

  if found then
    v_history_conf := least(
      0.8,
      greatest(0.6, 0.6 + (v_history.score - 0.7) * (0.2 / 0.3))
    );
    return jsonb_build_object(
      'merchant_id', v_history.merchant_id,
      'category_id', v_history.category_id,
      'source',      'history',
      'confidence',  round(v_history_conf, 4)
    );
  end if;

  return jsonb_build_object('source', 'none', 'confidence', 0);
end;
$$;

revoke all on function public.run_categorization_cascade(text, bigint) from public;
grant execute on function public.run_categorization_cascade(text, bigint) to authenticated;

notify pgrst, 'reload schema';
