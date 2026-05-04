-- =============================================================================
-- 20260617120000_00060_profiles_onboarding_completed_jsonb.sql
--
-- F3-E6-T1: per-step onboarding wizard persistence.
--
-- Adds:
--   - public.profiles.onboarding_completed jsonb not null default '{}'::jsonb
--
-- Why a jsonb column rather than reusing onboarding_completed_at?
-- ────────────────────────────────────────────────────────────────
-- `onboarding_completed_at` is a binary "user finished or skipped the wizard"
-- timestamp — set once when the user reaches the Done state OR clicks Skip.
-- It does NOT track which intermediate steps were completed. The wizard
-- needs that fine-grained state so a user who completed step 1 and step 2
-- yesterday, then closed the tab, returns today to step 3 — not back to
-- step 1.
--
-- Shape of `onboarding_completed`:
--   {
--     "step1": true,   // account created (or step skipped)
--     "step2": true,   // import/manual transaction (or step skipped)
--     "step3": false,  // budget step (not yet reached)
--     "step4": false   // goal step (not yet reached)
--   }
--
-- Step state is set after the user *acts* on the step OR explicitly skips.
-- The wizard reads the jsonb on mount, finds the first false key, and
-- starts there. If the user skips all steps (or only completes some) and
-- then quits, `onboarding_completed_at` stays null — they can resume.
-- If the user clicks the global "Preskoči" in the top-right, both fields
-- update at once: the jsonb fills with `true` for whichever step was
-- skipped, and `onboarding_completed_at` is set.
--
-- Default '{}' (empty object): the wizard treats unset keys as `false`.
-- No need to back-fill; existing rows remain untouched and just won't
-- trigger the wizard again because their `onboarding_completed_at` is
-- already set (or, for legacy fresh users, the wizard's "fresh user"
-- detection in pocetna/page.tsx checks accounts/transactions counts too).
-- =============================================================================

alter table public.profiles
  add column onboarding_completed jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding_completed is
  'Per-step wizard progress (F3-E6). Shape: { step1: boolean, step2: boolean, step3: boolean, step4: boolean }. Unset keys treated as false. Read on wizard mount to resume at the first incomplete step. Cleared by the dev-only resetOnboarding action.';

notify pgrst, 'reload schema';
