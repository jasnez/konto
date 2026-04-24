-- =============================================================================
-- 20260424160000_00020_backfill_opening_balance_transactions.sql
--
-- Backfills missing "Početno stanje" (opening balance) transactions for
-- accounts that have initial_balance_cents != 0 but no corresponding
-- opening-balance transaction.
--
-- Root cause: accounts created before the `createAccount` server action
-- started inserting an opening-balance transaction had their
-- `current_balance_cents` set directly to `initial_balance_cents`. Once
-- migration 00013 ran its one-time backfill
-- (current_balance_cents = SUM(transactions)), those accounts lost their
-- balance because no transaction existed.
--
-- This migration is idempotent: it uses NOT EXISTS to skip accounts that
-- already have a correctly-inserted opening-balance transaction.
-- =============================================================================

do $$
declare
  acct       record;
  ob_cat_id  uuid;
  base_cur   text;
  base_cents bigint;
  fx         numeric;

  bam_eur constant numeric := 1.95583;   -- fixed BAM/EUR currency-board rate
begin
  for acct in
    select
      a.id,
      a.user_id,
      a.initial_balance_cents,
      a.currency,
      a.created_at::date as created_date
    from public.accounts a
    where a.initial_balance_cents <> 0
      and a.deleted_at is null
      -- No opening-balance transaction exists for this account
      and not exists (
        select 1
        from public.transactions t
        left join public.categories c on c.id = t.category_id and c.deleted_at is null
        where t.account_id = a.id
          and t.deleted_at is null
          and (
            t.description = 'Početno stanje'
            or c.slug     = 'opening_balance'
          )
      )
  loop
    -- Resolve user's base currency (default BAM if profile missing)
    select coalesce(p.base_currency, 'BAM')
      into base_cur
      from public.profiles p
     where p.id = acct.user_id
       and p.deleted_at is null;

    base_cur := coalesce(base_cur, 'BAM');

    -- Simple FX conversion (matches app-layer logic in lib/fx/convert.ts)
    if acct.currency = base_cur then
      base_cents := acct.initial_balance_cents;
      fx         := 1.0;
    elsif acct.currency = 'BAM' and base_cur = 'EUR' then
      base_cents := round(acct.initial_balance_cents / bam_eur);
      fx         := 1.0 / bam_eur;
    elsif acct.currency = 'EUR' and base_cur = 'BAM' then
      base_cents := round(acct.initial_balance_cents * bam_eur);
      fx         := bam_eur;
    else
      -- Unknown pair: keep 1:1 and mark stale so FX refresh can correct it later
      base_cents := acct.initial_balance_cents;
      fx         := 1.0;
    end if;

    -- Locate opening_balance category for this user
    select id
      into ob_cat_id
      from public.categories
     where user_id    = acct.user_id
       and slug       = 'opening_balance'
       and deleted_at is null
     limit 1;

    if ob_cat_id is null then
      raise notice 'backfill_opening_balance: no opening_balance category for user %, skipping account %',
        acct.user_id, acct.id;
      continue;
    end if;

    insert into public.transactions (
      user_id,
      account_id,
      original_amount_cents,
      original_currency,
      base_amount_cents,
      base_currency,
      fx_rate,
      fx_rate_date,
      fx_stale,
      transaction_date,
      source,
      category_id,
      category_source,
      description
    ) values (
      acct.user_id,
      acct.id,
      acct.initial_balance_cents,
      acct.currency,
      base_cents,
      base_cur,
      fx,
      acct.created_date,
      -- Mark stale when we had to fall back to 1:1 for an unknown FX pair
      case
        when acct.currency = base_cur then false
        when (acct.currency = 'BAM' and base_cur = 'EUR')
          or (acct.currency = 'EUR' and base_cur = 'BAM') then false
        else true
      end,
      acct.created_date,
      'manual',
      ob_cat_id,
      'user',
      'Početno stanje'
    );

    raise notice 'backfill_opening_balance: inserted opening-balance tx for account % (% %)',
      acct.id, acct.initial_balance_cents, acct.currency;
  end loop;
end $$;
