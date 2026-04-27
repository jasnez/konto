-- DL-2: enforce transfer pair symmetry at the database layer.
--
-- Before this migration, the only thing keeping a transfer pair "in sync" was
-- application code in `create_transfer_pair` and `deleteTransaction`. Any code
-- path that bypassed those (admin SQL, future RPC, buggy migration) could
-- create or leave a one-legged transfer where:
--   • is_transfer = true but transfer_pair_id is NULL, or
--   • A.transfer_pair_id = B but B.transfer_pair_id ≠ A, or
--   • only one leg of a pair has deleted_at set.
-- Each of these surfaces as phantom income/expense in dashboards because the
-- non-transfer leg is counted as a real flow.
--
-- The fix has four parts:
--   1. Pre-flight scan: refuse to migrate if existing data already violates
--      the new invariants (caller fixes data first).
--   2. Immediate CHECK: is_transfer=true ⇒ transfer_pair_id IS NOT NULL
--      (and the inverse: is_transfer=false ⇒ transfer_pair_id IS NULL).
--   3. FK becomes ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED so the RPC
--      can insert both legs (each pointing to the other) in one transaction.
--   4. Deferred constraint trigger enforces symmetry, same user, both legs
--      flagged is_transfer=true, and synchronised deleted_at across the pair.
-- The RPC itself is rewritten to pre-generate UUIDs so each INSERT is valid
-- on its own row — no transient NULL transfer_pair_id state to defer past.

-- ── 1. Pre-flight: refuse migration on dirty data ────────────────────────────

do $$
declare
  v_orphan_legs    int;
  v_dangling_pair  int;
  v_asym_pairs     int;
  v_self_ref       int;
  v_owner_mismatch int;
  v_deleted_asym   int;
begin
  select count(*) into v_orphan_legs
    from public.transactions
   where is_transfer = true and transfer_pair_id is null;

  select count(*) into v_dangling_pair
    from public.transactions
   where is_transfer = false and transfer_pair_id is not null;

  select count(*) into v_self_ref
    from public.transactions
   where transfer_pair_id = id;

  select count(*) into v_asym_pairs
    from public.transactions a
    join public.transactions b on a.transfer_pair_id = b.id
   where a.is_transfer = true
     and (b.transfer_pair_id is distinct from a.id
          or b.is_transfer = false);

  select count(*) into v_owner_mismatch
    from public.transactions a
    join public.transactions b on a.transfer_pair_id = b.id
   where a.is_transfer = true and b.user_id is distinct from a.user_id;

  select count(*) into v_deleted_asym
    from public.transactions a
    join public.transactions b on a.transfer_pair_id = b.id
   where a.is_transfer = true
     and (a.deleted_at is null) is distinct from (b.deleted_at is null);

  if v_orphan_legs > 0 then
    raise exception 'DL-2: % rows have is_transfer=true with NULL transfer_pair_id. Repair before migrating.', v_orphan_legs;
  end if;

  if v_dangling_pair > 0 then
    raise exception 'DL-2: % rows have is_transfer=false but a non-null transfer_pair_id. Repair before migrating.', v_dangling_pair;
  end if;

  if v_self_ref > 0 then
    raise exception 'DL-2: % rows reference themselves via transfer_pair_id. Repair before migrating.', v_self_ref;
  end if;

  if v_asym_pairs > 0 then
    raise exception 'DL-2: % asymmetric transfer pairs (A→B but B↛A or B.is_transfer=false). Repair before migrating.', v_asym_pairs;
  end if;

  if v_owner_mismatch > 0 then
    raise exception 'DL-2: % transfer pairs span different users. Repair before migrating.', v_owner_mismatch;
  end if;

  if v_deleted_asym > 0 then
    raise exception 'DL-2: % transfer pairs have one leg deleted and the other live. Repair before migrating.', v_deleted_asym;
  end if;
end $$;

-- ── 2. CHECK constraint: is_transfer ↔ transfer_pair_id ───────────────────────

alter table public.transactions
  add constraint transactions_transfer_pair_consistency_check
  check (
    (is_transfer = true  and transfer_pair_id is not null)
    or
    (is_transfer = false and transfer_pair_id is null)
  ) not valid;

alter table public.transactions
  validate constraint transactions_transfer_pair_consistency_check;

-- ── 3. Replace FK: cascade-delete + deferrable so the RPC can self-reference ──

alter table public.transactions
  drop constraint transactions_transfer_pair_id_fkey;

alter table public.transactions
  add constraint transactions_transfer_pair_id_fkey
  foreign key (transfer_pair_id)
  references public.transactions(id)
  on delete cascade
  deferrable initially deferred;

-- ── 4. Constraint trigger: symmetry + owner + deleted_at sync ─────────────────

create or replace function public.check_transfer_pair_symmetry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner record;
  v_referencing record;
begin
  -- Path A: row is currently a transfer leg.
  if new.is_transfer = true then
    if new.transfer_pair_id is null then
      raise exception 'TRANSFER_PAIR_INVARIANT: row % has is_transfer=true with NULL transfer_pair_id', new.id;
    end if;

    if new.transfer_pair_id = new.id then
      raise exception 'TRANSFER_PAIR_INVARIANT: row % references itself as transfer pair', new.id;
    end if;

    select id, user_id, transfer_pair_id, is_transfer, deleted_at
      into v_partner
      from public.transactions
     where id = new.transfer_pair_id;

    if not found then
      raise exception 'TRANSFER_PAIR_INVARIANT: partner % does not exist (row %)',
        new.transfer_pair_id, new.id;
    end if;

    if v_partner.transfer_pair_id is distinct from new.id then
      raise exception 'TRANSFER_PAIR_INVARIANT: asymmetry — row % → %, but % → %',
        new.id, new.transfer_pair_id, v_partner.id, v_partner.transfer_pair_id;
    end if;

    if v_partner.is_transfer = false then
      raise exception 'TRANSFER_PAIR_INVARIANT: partner % must have is_transfer=true', v_partner.id;
    end if;

    if v_partner.user_id is distinct from new.user_id then
      raise exception 'TRANSFER_PAIR_INVARIANT: partner % has different user_id', v_partner.id;
    end if;

    -- Both legs must be either live or soft-deleted; never one of each.
    if (new.deleted_at is null) is distinct from (v_partner.deleted_at is null) then
      raise exception 'TRANSFER_PAIR_INVARIANT: deleted_at mismatch — row % deleted_at=%, partner % deleted_at=%',
        new.id, new.deleted_at, v_partner.id, v_partner.deleted_at;
    end if;

    return null;
  end if;

  -- Path B: row is not a transfer. transfer_pair_id must be NULL (CHECK
  -- already enforces this; trigger gives a clearer error). Additionally,
  -- no other row may still claim this row as its transfer partner.
  if new.transfer_pair_id is not null then
    raise exception 'TRANSFER_PAIR_INVARIANT: row % has is_transfer=false but transfer_pair_id=%',
      new.id, new.transfer_pair_id;
  end if;

  select id into v_referencing
    from public.transactions
   where transfer_pair_id = new.id
     and is_transfer = true
   limit 1;

  if found then
    raise exception 'TRANSFER_PAIR_INVARIANT: row % cannot have is_transfer=false because % still references it as transfer partner',
      new.id, v_referencing.id;
  end if;

  return null;
end;
$$;

revoke all on function public.check_transfer_pair_symmetry() from public;

create constraint trigger transactions_transfer_pair_symmetry
  after insert or update of transfer_pair_id, is_transfer, user_id, deleted_at
  on public.transactions
  deferrable initially deferred
  for each row
  execute function public.check_transfer_pair_symmetry();

-- ── 5. Rewrite create_transfer_pair: pre-generate UUIDs, single INSERT each ───
--
-- The previous implementation INSERTed both rows with transfer_pair_id=NULL
-- and then UPDATEed each leg to point at the other. With the new CHECK
-- constraint that pattern would fail at the first INSERT (NULL pair_id while
-- is_transfer=true is now illegal). Instead we generate both UUIDs up front
-- and INSERT each row already pointing at its partner. The deferred FK
-- tolerates the temporary forward reference; the deferred symmetry trigger
-- runs at COMMIT when both rows are in place.

drop function if exists public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
);

create function public.create_transfer_pair(
  p_from_account_id    uuid,
  p_to_account_id      uuid,
  p_from_amount_cents  bigint,
  p_to_amount_cents    bigint,
  p_from_currency      text,
  p_to_currency        text,
  p_from_base_cents    bigint,
  p_to_base_cents      bigint,
  p_base_currency      text,
  p_from_fx_rate       numeric(20,10),
  p_to_fx_rate         numeric(20,10),
  p_from_fx_rate_date  date,
  p_to_fx_rate_date    date,
  p_from_fx_stale      boolean,
  p_to_fx_stale        boolean,
  p_transaction_date   date,
  p_notes              text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_from_id  uuid := gen_random_uuid();
  v_to_id    uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'INVALID: from and to accounts must differ';
  end if;

  if not exists (
    select 1 from public.accounts
    where id = p_from_account_id and user_id = v_user_id and deleted_at is null
  ) then
    raise exception 'FORBIDDEN: from_account';
  end if;

  if not exists (
    select 1 from public.accounts
    where id = p_to_account_id and user_id = v_user_id and deleted_at is null
  ) then
    raise exception 'FORBIDDEN: to_account';
  end if;

  insert into public.transactions (
    id,
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    account_ledger_cents,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer,
    transfer_pair_id
  ) values (
    v_from_id,
    v_user_id,
    p_from_account_id,
    p_from_amount_cents,
    p_from_currency,
    p_from_base_cents,
    p_base_currency,
    p_from_amount_cents,
    p_from_fx_rate,
    p_from_fx_rate_date,
    p_from_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true,
    v_to_id
  );

  insert into public.transactions (
    id,
    user_id,
    account_id,
    original_amount_cents,
    original_currency,
    base_amount_cents,
    base_currency,
    account_ledger_cents,
    fx_rate,
    fx_rate_date,
    fx_stale,
    transaction_date,
    notes,
    source,
    is_transfer,
    transfer_pair_id
  ) values (
    v_to_id,
    v_user_id,
    p_to_account_id,
    p_to_amount_cents,
    p_to_currency,
    p_to_base_cents,
    p_base_currency,
    p_to_amount_cents,
    p_to_fx_rate,
    p_to_fx_rate_date,
    p_to_fx_stale,
    p_transaction_date,
    p_notes,
    'manual',
    true,
    v_from_id
  );

  return jsonb_build_object('from_id', v_from_id, 'to_id', v_to_id);
end;
$$;

grant execute on function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  numeric(20,10), numeric(20,10),
  date, date,
  boolean, boolean,
  date, text
) to authenticated;

notify pgrst, 'reload schema';
