-- 00075: surface import duplicates in review instead of silently dropping them.
--
-- Audit 2026-06-10 follow-up (S-1). Until now, duplicate detection
-- (import_dedup_filter: same account, amount, date ±1 day, merchant similarity
-- > 0.8) ran only at finalize, where matching rows were silently skipped. A
-- user with two genuinely identical same-day purchases (e.g. two coffees) lost
-- the second one without ever seeing it.
--
-- New model: detection moves to parse time. Rows flagged as potential
-- duplicates are marked here and deselected (selected_for_import = false) so the
-- review screen can show a "Moguć duplikat" badge and let the user confirm which
-- to import. finalize no longer auto-skips — it imports exactly what the user
-- left selected.

alter table public.parsed_transactions
  add column if not exists is_potential_duplicate boolean not null default false;

comment on column public.parsed_transactions.is_potential_duplicate is
  'Set at parse time when import_dedup_filter matched this row against an existing transaction or an earlier row in the same batch. Such rows are deselected by default; the review UI badges them and the user confirms which to import.';

notify pgrst, 'reload schema';
