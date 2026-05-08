-- =============================================================================
-- 20260628120000_00071_tx_amount_nonzero.sql
--
-- DB.2 (Supabase architecture audit 2026-05-08): correctness backstop on
-- transactions.original_amount_cents and transactions.base_amount_cents.
--
-- Rationale: Phase-3 tables (budgets, goals, recurring_transactions) all
-- enforce strictly-positive amounts via CHECK constraints (00053:67,
-- 00056:52, 00058:45). The transactions table — the heart of the schema —
-- has only NOT NULL on its amount columns; zero values pass through the
-- DB layer untouched.  A logic bug in Gemini parsing, transfer-pair RPC,
-- or finalize_import_batch could insert ghost rows that:
--   - show in transaction lists as visible-but-zero entries
--   - are no-ops for the account-balance trigger (sum NULL → 0)
--   - distort budget / goal / recurring spend calculations downstream
--
-- This migration adds a defensive CHECK that rejects zero amounts.
--
-- Sign convention: transactions store SIGNED minor units (negative for
-- expense, positive for income).  Zero is meaningless for either side, so
-- `<> 0` (not `> 0`) is the correct constraint.
--
-- Pre-flight: this migration aborts if any existing row has zero amount.
-- The DO-block below SELECTs first; the ALTER TABLE only runs if the
-- backfill check passes.  If you see "Zero-amount transaction rows
-- detected", investigate via:
--   SELECT id, user_id, transaction_date, original_amount_cents, base_amount_cents
--     FROM public.transactions
--    WHERE original_amount_cents = 0 OR base_amount_cents = 0;
-- ...then either fix the data or skip this migration on prod (file an
-- issue first — the bug that produced the row should be fixed upstream).
-- =============================================================================


do $check$
declare
  v_zero_count bigint;
begin
  select count(*)::bigint into v_zero_count
    from public.transactions
   where original_amount_cents = 0
      or base_amount_cents = 0;

  if v_zero_count > 0 then
    raise exception
      'Zero-amount transaction rows detected (% rows). Cannot apply tx_amount_nonzero CHECK without data cleanup. See migration 00071 header for diagnostic query.',
      v_zero_count;
  end if;
end
$check$;


alter table public.transactions
  add constraint tx_amount_nonzero
  check (original_amount_cents <> 0 and base_amount_cents <> 0);


comment on constraint tx_amount_nonzero on public.transactions is
  'DB.2 audit 2026-05-08: zero-amount transactions are meaningless under the '
  'signed-minor-units sign convention (negative=expense, positive=income). '
  'A zero amount typically signals a logic bug upstream (Gemini parse, transfer '
  'pair, finalize_import_batch).  Reject at DB layer rather than carrying ghost '
  'rows that distort balance triggers and Phase-3 spend calculations.';


notify pgrst, 'reload schema';
