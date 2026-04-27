-- Migration 00039: Single-use deletion cancel tokens (SE-1)
--
-- Adds a table that records every consumed cancel-token jti so replayed tokens
-- are rejected even if the HMAC signature and expiry are still valid.
--
-- The jti is a UUID included in the cancel-token payload at signing time.
-- run-cancel-deletion.ts inserts the jti atomically before acting on the token;
-- a unique-constraint violation (23505) means the token has already been used.
--
-- This table is service-role only — no direct RLS-based client access.
-- Expired rows are cleaned up by the nightly hard-delete cron job (or any
-- maintenance script) via the expires_at index.

create table if not exists public.deletion_cancel_tokens (
  jti         uuid        primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz not null default now()
);

-- For efficient cleanup of expired tokens.
create index if not exists deletion_cancel_tokens_expires_at_idx
  on public.deletion_cancel_tokens (expires_at);

-- No direct client writes — all access is via the service-role key inside
-- run-cancel-deletion.ts.  Enable RLS and add no policies so no JWT-based
-- client can touch this table.
alter table public.deletion_cancel_tokens enable row level security;

comment on table public.deletion_cancel_tokens is
  'Records consumed account-deletion cancel-token JTIs. Prevents replay attacks.';
