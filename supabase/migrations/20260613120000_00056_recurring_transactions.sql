-- =============================================================================
-- 20260613120000_00056_recurring_transactions.sql
--
-- F3-E2-T2: persistence + Server-Action layer for confirmed recurring
-- charges. Builds on top of the pure detection algorithm shipped in
-- F3-E2-T1 (lib/analytics/recurring-detection.ts) — that module returns
-- candidates; this migration is where the user's confirmed answers
-- live.
--
-- Adds:
--   1. public.recurring_transactions — one row per confirmed
--      subscription. RLS-scoped to the user; defense-in-depth on
--      INSERT/UPDATE so merchant_id/category_id/account_id must
--      belong to the same user (re-using user_owns_* helpers).
--   2. Foreign key on the existing transactions.recurring_group_id
--      column so we can navigate from a transaction back to its parent
--      pretplata. Column existed since the initial schema; the FK and
--      partial index ship now.
--   3. RPC public.confirm_recurring(p_payload jsonb) — atomically
--      inserts the new row AND back-fills recurring_group_id on the
--      candidate's transaction history. Splitting these into two
--      separate Server Action steps would leave a window where a
--      pretplata exists with no linked history; the RPC keeps both
--      writes inside one transaction so RLS aborts both on failure.
--   4. RPC public.get_recurring_with_history(p_recurring_id uuid) —
--      returns the row plus its last 10 linked transactions for the
--      detail drawer.
--
-- Pause semantics (per project decision): `active = true` plus
-- `paused_until` set in the future. The UI treats paused_until > now()
-- as "paused"; once the date passes, the row is back to active without
-- any cron intervention. `cancel` flips active to false and clears the
-- paused_until.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- recurring_transactions
-- ---------------------------------------------------------------------------
create table public.recurring_transactions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  merchant_id              uuid references public.merchants(id) on delete set null,
  category_id              uuid references public.categories(id) on delete set null,
  account_id               uuid references public.accounts(id) on delete set null,
  description              text not null check (length(description) between 1 and 200),
  period                   text not null
    check (period in ('weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly')),
  -- Median amount in minor units. Always non-zero (sign carries direction).
  -- For T1 every recurring is an outflow (negative); we keep the column
  -- signed so a future inflow expansion (payroll) doesn't need a migration.
  average_amount_cents     bigint not null check (average_amount_cents <> 0),
  currency                 text not null check (length(currency) = 3),
  next_expected_date       date,
  last_seen_date           date,
  active                   boolean not null default true,
  -- When set, the UI renders "Pauzirano do …" until the date passes.
  -- Auto-resume is intentional: no cron needed; clients filter on
  -- paused_until > now() at read time.
  paused_until             date,
  -- Snapshot of the detector's confidence at confirmation time. Useful
  -- for analytics ("how often does ≥0.7 confirm vs <0.7"). Optional —
  -- a manually created recurring (T3 future) won't have this.
  detection_confidence     numeric(3,2) check (detection_confidence between 0 and 1),
  occurrences              int not null default 0 check (occurrences >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.recurring_transactions is
  'F3-E2: confirmed recurring charges. One row per pretplata. Pause via paused_until + active=true; cancel via active=false.';

-- Hot path for /pretplate listing — only active rows ever matter on
-- read; paused ones are still active=true and surface here too.
create index idx_recurring_user_active
  on public.recurring_transactions (user_id)
  where active is true;

-- For a future "what's coming up" dashboard widget.
create index idx_recurring_next_expected
  on public.recurring_transactions (next_expected_date)
  where active is true and next_expected_date is not null;

create trigger recurring_updated_at
  before update on public.recurring_transactions
  for each row execute function public.trigger_set_updated_at();


-- ---------------------------------------------------------------------------
-- RLS
--
-- INSERT/UPDATE additionally enforce defense-in-depth: the related
-- merchant/category/account, when set, must be owned by the same user.
-- A leaked merchant_id from another user can't be linked to this row.
-- ---------------------------------------------------------------------------
alter table public.recurring_transactions enable row level security;

create policy "users select own recurring"
  on public.recurring_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own recurring"
  on public.recurring_transactions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (merchant_id is null or public.user_owns_merchant(merchant_id))
    and (category_id is null or public.user_owns_category(category_id))
    and (account_id is null or public.user_owns_account(account_id))
  );

create policy "users update own recurring"
  on public.recurring_transactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (merchant_id is null or public.user_owns_merchant(merchant_id))
    and (category_id is null or public.user_owns_category(category_id))
    and (account_id is null or public.user_owns_account(account_id))
  );

create policy "users delete own recurring"
  on public.recurring_transactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- transactions.recurring_group_id ↔ recurring_transactions FK
--
-- The column has lived on transactions since the initial schema as a
-- placeholder; we now add the actual constraint + index. ON DELETE SET
-- NULL: deleting a pretplata should NOT cascade-delete its history —
-- those transactions still happened, they just lose their parent
-- pointer.
-- ---------------------------------------------------------------------------
alter table public.transactions
  add constraint transactions_recurring_group_id_fkey
  foreign key (recurring_group_id)
  references public.recurring_transactions(id)
  on delete set null;

create index if not exists idx_tx_recurring_group
  on public.transactions (recurring_group_id)
  where recurring_group_id is not null;


-- ---------------------------------------------------------------------------
-- confirm_recurring(payload) — atomic insert + back-fill
--
-- Payload shape (validated client-side via Zod):
--   {
--     merchantId: uuid | null,
--     categoryId: uuid | null,
--     accountId:  uuid | null,
--     description: string,
--     period: string,
--     averageAmountCents: bigint-as-string,
--     currency: string,
--     lastSeen: 'YYYY-MM-DD',
--     nextExpected: 'YYYY-MM-DD',
--     confidence: number,
--     occurrences: int,
--     transactionIds: uuid[]
--   }
--
-- Why an RPC instead of two Server Action steps?
-- ──────────────────────────────────────────────
-- The bind step (UPDATE transactions SET recurring_group_id = …) is
-- conceptually part of confirmation. If the INSERT succeeds and the
-- UPDATE then fails (RLS, race, soft-deleted tx), we'd have a
-- pretplata pointing nowhere and would need rollback logic on the JS
-- side. Doing both in one plpgsql block keeps the writes
-- transactional: any failure aborts both.
--
-- Auth: SECURITY INVOKER — the writes happen as the calling user, RLS
-- gates everything. Foreign-tx ids passed in `transactionIds` are
-- silently ignored if RLS doesn't see them (UPDATE … WHERE user_id =
-- auth.uid() filters them out).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_recurring(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
  v_tx_ids  uuid[];
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Insert the recurring row. The RLS WITH CHECK clause enforces
  -- ownership of merchant/category/account; we don't re-check here.
  insert into public.recurring_transactions (
    user_id,
    merchant_id,
    category_id,
    account_id,
    description,
    period,
    average_amount_cents,
    currency,
    next_expected_date,
    last_seen_date,
    detection_confidence,
    occurrences
  ) values (
    v_user_id,
    nullif(p_payload->>'merchantId', '')::uuid,
    nullif(p_payload->>'categoryId', '')::uuid,
    nullif(p_payload->>'accountId',  '')::uuid,
    p_payload->>'description',
    p_payload->>'period',
    (p_payload->>'averageAmountCents')::bigint,
    p_payload->>'currency',
    nullif(p_payload->>'nextExpected', '')::date,
    nullif(p_payload->>'lastSeen', '')::date,
    nullif(p_payload->>'confidence', '')::numeric,
    coalesce((p_payload->>'occurrences')::int, 0)
  )
  returning id into v_id;

  -- Pull the candidate's transaction ids out of the JSON array.
  -- jsonb_array_elements_text + cast keeps it tolerant if the array
  -- is missing or empty.
  if jsonb_typeof(p_payload->'transactionIds') = 'array' then
    select coalesce(array_agg(t::uuid), '{}')
      into v_tx_ids
      from jsonb_array_elements_text(p_payload->'transactionIds') t;

    if array_length(v_tx_ids, 1) > 0 then
      update public.transactions
         set recurring_group_id = v_id,
             is_recurring = true
       where user_id = v_user_id
         and id = any(v_tx_ids)
         and deleted_at is null;
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.confirm_recurring(jsonb) from public;
grant execute on function public.confirm_recurring(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- get_recurring_with_history(p_recurring_id) — detail drawer payload
--
-- Returns the recurring row + last 10 linked transactions, sorted by
-- transaction_date DESC. SECURITY INVOKER so RLS naturally gates;
-- a foreign id yields { recurring: null, transactions: [] }.
-- ---------------------------------------------------------------------------
create or replace function public.get_recurring_with_history(p_recurring_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_recurring jsonb;
  v_transactions jsonb;
begin
  select to_jsonb(r) into v_recurring
    from public.recurring_transactions r
   where r.id = p_recurring_id;

  if v_recurring is null then
    return jsonb_build_object('recurring', null, 'transactions', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.transaction_date desc, t.id desc), '[]'::jsonb)
    into v_transactions
    from (
      select id, transaction_date, base_amount_cents, base_currency,
             original_amount_cents, original_currency, merchant_raw, description
        from public.transactions
       where recurring_group_id = p_recurring_id
         and deleted_at is null
       order by transaction_date desc, id desc
       limit 10
    ) t;

  return jsonb_build_object('recurring', v_recurring, 'transactions', v_transactions);
end;
$$;

revoke all on function public.get_recurring_with_history(uuid) from public;
grant execute on function public.get_recurring_with_history(uuid) to authenticated;


notify pgrst, 'reload schema';
