-- =============================================================================
-- 20260621120000_00064_profiles_dashboard_section_order.sql
--
-- Per-user dashboard widget ordering and visibility.
--
-- Adds:
--   - public.profiles.dashboard_section_order jsonb (nullable, no default)
--
-- Why nullable instead of default '{}'::jsonb?
-- ────────────────────────────────────────────────────────────────────────
-- NULL is the explicit "use code defaults" signal. The dashboard reader
-- (lib/dashboard/sections.ts → resolveSectionOrder) returns
-- DEFAULT_VISIBLE_ORDER when the column is NULL, an invalid shape, or an
-- empty/unknown-keys array. Storing '{}' or '{"order":[]}' would mean the
-- user explicitly hid every widget — that is a legitimate state but
-- distinct from "user has not customized". Keeping NULL = "uncustomized"
-- preserves both intents.
--
-- Shape when populated:
--   { "order": ["hero", "donut", "forecast", "budgets", "insights", "recent_tx"] }
--
-- Missing keys = hidden. The reader is tolerant: unknown keys (schema
-- drift) and duplicates are filtered. New sections added in code do NOT
-- auto-appear in a user's order — they show up in the "Hidden sections"
-- tray in edit mode so users can opt in.
--
-- RLS inherits from the existing profiles table policies (self-only
-- read/update). No additional grants needed.
-- =============================================================================

alter table public.profiles
  add column dashboard_section_order jsonb;

comment on column public.profiles.dashboard_section_order is
  'User-customized dashboard widget order and visibility. Shape: { "order": string[] } where order lists visible section keys in user-preferred order; missing keys are hidden. NULL = use DEFAULT_VISIBLE_ORDER from lib/dashboard/sections.ts.';

notify pgrst, 'reload schema';
