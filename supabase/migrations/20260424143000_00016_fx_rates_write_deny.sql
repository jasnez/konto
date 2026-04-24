-- =============================================================================
-- 20260424143000_00016_fx_rates_write_deny.sql
--
-- Defense-in-depth on public.fx_rates.
--
-- Migration 00005 granted INSERT/UPDATE/DELETE on every public table to
-- `authenticated` and relied on RLS absence to deny writes (fx_rates only
-- has a `for select using (true)` policy). That works today but is fragile —
-- any future permissive policy or owner change would open a user-writable
-- rate cache, letting a crafted session insert a fake EUR→BAM rate and
-- mis-convert every amount on the dashboard.
--
-- REVOKE at the GRANT layer is authoritative regardless of RLS, and it
-- cannot be bypassed by a mistakenly-added policy. `service_role` retains
-- full access — the FX refresh job and edge function run with service_role.
-- Reads remain open via the existing `anyone reads fx rates` policy, which
-- also requires the SELECT grant from 00005 (not revoked here).
--
-- A restrictive RLS policy was considered and rejected: `for all ... using
-- (false)` would also block SELECT, and splitting it per-operation adds
-- moving parts without buying anything the REVOKE doesn't already give.
-- =============================================================================

revoke insert, update, delete on public.fx_rates from authenticated;
revoke insert, update, delete on public.fx_rates from anon;
