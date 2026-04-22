-- =============================================================================
-- Simplify profiles.base_currency and profiles.locale
--
-- Narrow the CHECK allow-lists to what the UI actually offers for Faza 0:
--   base_currency: BAM, EUR, USD  (was BAM,EUR,RSD,USD,GBP,CHF,MKD,HRK)
--   locale:       bs-BA, en-US    (was bs-BA,sr-RS-Latn,sr-RS-Cyrl,
--                                       hr-HR,mk-MK,en-US)
--
-- Any existing row with a now-unsupported value is reset to the column
-- default (BAM / bs-BA) so the fresh CHECK constraint can be added without
-- violating existing data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Drop the auto-named CHECK constraints created by the initial migration.
-- The names below are the Postgres defaults (`<table>_<column>_check`);
-- IF EXISTS keeps this migration idempotent if they were ever renamed.
-- -----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_base_currency_check;

alter table public.profiles
  drop constraint if exists profiles_locale_check;


-- -----------------------------------------------------------------------------
-- Normalize existing rows whose values would violate the narrower lists.
-- -----------------------------------------------------------------------------
update public.profiles
set base_currency = 'BAM'
where base_currency not in ('BAM', 'EUR', 'USD');

update public.profiles
set locale = 'bs-BA'
where locale not in ('bs-BA', 'en-US');


-- -----------------------------------------------------------------------------
-- Re-add the CHECK constraints with the narrower allow-lists.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_base_currency_check
  check (base_currency in ('BAM', 'EUR', 'USD'));

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('bs-BA', 'en-US'));
