-- Soft-delete marker for account deletion (30-day window before hard delete).

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists idx_profiles_deleted_at_pending
  on public.profiles (deleted_at)
  where deleted_at is not null;

comment on column public.profiles.deleted_at is
  'When set, the account is scheduled for removal. Hard-delete runs after 30 days.';
