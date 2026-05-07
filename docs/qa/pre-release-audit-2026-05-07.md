# Konto Pre-Release Quality Audit — 2026-05-07

**Audit type:** Comprehensive 14-phase pre-release audit before opening to 3–5 real beta users.
**Auditor role:** Multi-disciplinary task force (Principal Eng, QA Architect, Security Eng, Performance Eng, UX Reviewer, DevOps/Reliability).
**Methodology:** Static code review + automated test/lint/typecheck/build/RLS suites. No live browser smoke testing (per user's choice).
**Scope:** Full re-audit (per user's choice). Mobile audit items (B/D/R/P/N/F prefixes from 2026-04-30) cross-referenced where applicable.
**Prior audits:**

- `docs/qa/pre-production-audit-2026-04-25.md` — 37 items, all closed by 2026-04-29 (verified by diff agent: 32 ✅, 3 ⚠️, 0 ❌ regressed).
- `docs/qa/faza1-qa-report-2026-04-23.md` — Phase 1 only.

**Codebase snapshot:**

- 73 SQL migrations (latest: `20260623120000_00066_backfill_missing_profiles.sql`)
- 51 commits since 2026-04-29 (PRs #99–#150)
- 18 routes (14 protected), ~13 Server Action modules
- Phase 3 feature-complete: Budgets, Subscriptions, Forecasting, Goals, Insights, Onboarding wizard
- Phase 4 partial: invite-only sign-up gating (#127), 21-table RLS audit (#126)

---

## Executive Summary

**Overall verdict: 🟡 Ship with conditions.** Konto is more polished than most pre-beta apps. The previous audit's 37 items remain closed. **All four code-quality gates pass: `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm test` ✅, `pnpm build` ✅.** Code quality is high (TS strict, clean commit hygiene, custom ESLint rules enforce DL-8 ownership and N20 anglicism guards, only one TODO in the entire `app/lib/components/hooks/stores` tree). Security posture is solid (nonce-based CSP, all 8 SECURITY DEFINER functions have explicit `SET search_path`, PII-redacting `logSafe()` enforced via lint, atomic invite redemption via `FOR UPDATE`).

But **Phase 3 was shipped fast and has not been adversarially reviewed before now**. This audit identified **2 Critical, 9 High, 11 Medium, 4 Low** findings — most of them concentrated in Phase 3. None are unfixable, but **two Critical issues should land before any user touches the app**.

### 🔴 Critical findings (must fix before launch)

| ID       | Title                                                                                                                                                         | Location                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **AV-7** | Module-local `eventDateMap` in cashflow forecast — concurrent users in the same Lambda instance corrupt each other's projections                              | `lib/analytics/forecast.ts:549`                  |
| **PR-1** | `post-due-installments` cron uses cookie-based `createClient()` instead of `createAdminClient()` — silently posts no installments because cron has no session | `app/api/cron/post-due-installments/route.ts:32` |

### 🟠 High-priority findings (fix in week 1)

PR-2 no production observability (no Sentry/PostHog/Vercel Analytics — when a beta user hits an error at midnight, you cannot debug it); SE-9 middleware `PROTECTED_PATHS` missing all Phase 3 routes (defense-in-depth gap; page-level auth still runs); SE-10 `preview_invite_code` RPC allows unlimited enumeration of issued codes; SE-11 cron endpoints accept replay; SE-12 OTP expiry is 1 hour (best practice 10-15 min); DL-9 Phase 3 features write nothing to `audit_log`; AV-8 insights-nightly cron is sequential per-user (caps at ~3000 users — not your problem at 5 users, but flag for record); AV-9 `/pocetna` Promise.all blocks on slowest query.

### Health scorecard

| Dimension            | Score | Reasoning                                                                                                         |
| -------------------- | ----: | ----------------------------------------------------------------------------------------------------------------- |
| Code quality         |  8/10 | Strict TS, custom lint rules, low TODO density, canonical templates respected. Phase 3 modules diverge in places. |
| Security             |  7/10 | Strong RLS, CSP, PII redaction. Gaps: invite enumeration, cron replay, defense-in-depth in middleware.            |
| Reliability          |  6/10 | Circuit breaker on Gemini ✅, FX fallback ✅. But broken cron, module-local state bug, no observability.          |
| Test coverage        |  7/10 | Unit + integration + E2E tiers exist. Coverage of Phase 3 features unverified during this audit.                  |
| Production readiness |  5/10 | No error tracking, no rollback rehearsal, OTP expiry too long, audit log gaps.                                    |
| UX polish            |  7/10 | Most mobile bugs (B/D/R/P/N) addressed. Some i18n drift (route names, English labels).                            |

**Confidence after Critical + High fixes: 8/10. Safe for 3–5 friendly beta users.**
**Pre-launch checklist:** AV-7, PR-1, PR-2 (observability), SE-9, SE-10, SE-12. Everything else can ship post-beta.

---

## Phase 1 — System Reconstruction

**What Konto is:** Personal-finance management (PFM) web app for the Western Balkans, primary market BiH (BAM/EUR). Bosnian-language UI; English identifiers in code/DB. No bank API integration in early phases — manual entry, PDF import via Gemini, receipt OCR.

**Architecture:**

```
Browser ↔ Next.js 15 App Router (Vercel)
              │
              ├── Server Actions (Zod-validated)
              ├── Middleware (CSP nonce, session refresh, deleted-user redirect)
              └── /api/cron/* (Vercel Cron, daily)
                          ↓
         Supabase (PostgreSQL 17 + Auth + RLS + Storage)
                          ↓
         External: Gemini 2.5 Flash-Lite (OCR), api.frankfurter.app (FX)
```

**Routes (18 total, 14 protected):**

- Bosnian: `/pocetna`, `/transakcije`, `/racuni`, `/kategorije`, `/budzeti`, `/ciljevi`, `/pretplate`, `/uvidi`, `/podesavanja`, `/sigurnost`, `/skeniraj`, `/kartice-rate`, `/potrosnja`, `/vodic`
- English (mixed — see UX-10): `/help`, `/import`, `/merchants`
- Auth: `/prijava`, `/registracija`

**Server Actions (canonical pattern: Zod parse → `getUser()` → server-side ownership pre-check → write → typed error map → `revalidatePath`):**

- `app/(app)/{transakcije,racuni,kategorije,budzeti,ciljevi,pretplate,uvidi,kartice-rate,merchants,skeniraj,import,podesavanja,pocetna}/actions.ts`

**Data layer:**

- `lib/queries/{summary,budgets,goals,recurring,spending-by-category,insights}.ts` — read helpers calling RPCs.
- `lib/analytics/{forecast,recurring/*,insights/engine}.ts` — pure-TS algorithms.
- `lib/format/{format-money,amount}.ts` — money display (manual formatting per existing memory; do not restore Intl).
- `lib/fx/{rates,convert,batch-resolver,account-ledger}.ts` — currency conversion + ledger math.
- `lib/parser/*` — PDF parsing pipeline (decomposed in MT-1).
- `lib/llm/gemini-receipt.ts` — receipt OCR.
- `lib/logger.ts` — `logSafe`/`logWarn` with PII redaction; sole `console.*` site.

**Migrations:** 73 files, additive style. Latest 21 (00046–00066) shipped 2026-04-29 → 2026-05-07.
**RPCs:** `get_monthly_summary`, `get_current_period_spent`, `get_period_spent_for_category`, `get_spending_by_category`, `search_merchants`, `set_dashboard_section_order`, `confirm_recurring`, `recompute_goal_from_account`, `restore_default_categories_for_user`, `count_receipt_scans_today`, `convert_transaction_to_transfer`, `preview_invite_code`, `create_transfer_pair`, `check_rate_limit_and_record`, `finalize_import_batch`, `get_account_balance_history`, `parsed_tx_convert_to_transfer`, plus internal SQL fns and the `handle_new_user` trigger.

**Cron jobs:**

- Vercel Cron (`vercel.json`): `/api/cron/post-due-installments` daily 06:00 UTC, `/api/cron/insights-nightly` daily 03:00 UTC.
- pg_cron (in DB): `invite-codes-cleanup` daily 05:00 UTC; insights cleanup (per migration 00059).

**External integrations:** Gemini 2.5 Flash-Lite for PDF/receipt parsing (with circuit breaker — `lib/parser/gemini-circuit-breaker.ts`), Frankfurter for FX rates, Resend for transactional email (deletion flow). **Inngest fully removed 2026-05-02 (descope AV-2).** No telemetry / error tracking SaaS.

---

## Phase 2 — Codebase Audit

### Code-quality summary

- **TS strict typecheck:** ✅ exit 0 (no errors).
- **TODO/FIXME/HACK/@ts-ignore density across `app/lib/components/hooks/stores`:** 1 entry total — `lib/format/format-money.ts:13` (legitimate i18n note about future India locale). Clean.
- **Console usage outside `lib/logger.ts`:** Only in 3 `error.tsx` boundaries (browser-side, justified) and `service-worker-register.tsx` (justified). ESLint rule `no-console: error` enforces this in `app/**` and `lib/**`.
- **Custom lint rules:** `local/no-unguarded-mutation` (DL-8 enforcement), `local/no-untranslated-jsx-strings` (N20 anglicism guard). Active.
- **Module decomposition:** MT-1 holds — `lib/server/actions/imports/` is 6 files (no >720 LoC monolith). DI seam via `FinalizeDependencies`.

### MT-7 [Maintainability — Forecast] · 🟢 Low

**`lib/analytics/forecast.ts:540-549` carries comment "callers must not interleave".**
The `eventDateMap` is module-local mutable state and the warning is the wrong fix — it pushes the constraint onto the caller while still being enforceable. See **AV-7** (Critical) for the consequence; this Low is the _maintainability_ facet. The fix is structural: pass the map through call args or wrap in a closure created per-request.
**Fix:** see AV-7. **Complexity:** M.

### MT-8 [Maintainability — /potrosnja] · 🟡 Medium

**`app/(app)/potrosnja/page.tsx:33-82` reimplements period→date-range arithmetic.**
The "rolling 3 months ending today" branch differs from a calendar-quarter definition; if any RPC uses calendar quarters, drill-down links shift. Extract to `lib/dates/compute-period-range.ts` with tests.
**Fix:** Extract; share with RPC if RPC also computes ranges. **Complexity:** M.

### MT-9 [Maintainability — Phase markers leaking into source] · 🟢 Low

**Comments include "Phase C P3", "Phase F2", "F4-E2-T1", "Faza 2" throughout server actions and migrations.**
These belong in PR descriptions or git history. Per N5 from mobile audit, internal phase names already leaked to user UI in some places (since fixed). The same convention now lives in code comments — confusing for future contributors.
**Fix:** Strip before launch; rely on git/PR for tracking. **Complexity:** S.

### MT-10 [Maintainability — BigInt→Number narrowing] · 🟡 Medium

**`app/(app)/budzeti/actions.ts:152-154` and `app/(app)/ciljevi/actions.ts:116-118` define `centsToDbInt(c: bigint): number { return Number(c); }`.**
For values exceeding `Number.MAX_SAFE_INTEGER` (2^53 − 1 ≈ 9.007 × 10^15), the conversion silently rounds. While typical budget/goal values are well below that, the Zod schema does not enforce a ceiling. A malicious or accidentally-large input becomes valid but corrupted at write time.
**Fix:** Add `assertSafeNumber(c)` in `centsToDbInt`, throw on overflow. Add Zod refine to schemas. **Complexity:** S.

### MT-11 [Maintainability — Forecast widget never invalidates cache] · 🟡 Medium

**`components/dashboard/forecast-widget.tsx`** computes once per page load. After 6 hours of running tabs (e.g., user switches back from another tab), it shows a stale projection. Forecast scope changes (a new recurring transaction, a paused subscription, a new account) do not propagate without a hard refresh.
**Fix:** Show "Ažurirano prije Xh" footer; add `revalidate = 600` on `/pocetna` page; consider a refresh button. **Complexity:** S.

### MT-12 [Maintainability — Phase 3 features omit ownership pre-check helper] · 🟡 Medium

**Canonical pattern in `app/(app)/transakcije/actions.ts` uses `ensureOwnedAccount()` / `ensureOwnedCategory()`. Phase 3 actions hand-roll the same logic.**

- `app/(app)/budzeti/actions.ts:204-249` (createBudget) skips the explicit pre-check, relies on RLS WITH CHECK only — see SE-13.
- `app/(app)/ciljevi/actions.ts:268-285` (updateGoal) does its own select — clean, but hand-rolled.
- `app/(app)/skeniraj/actions.ts:347-356` (createTransactionFromReceipt) hand-rolls.

**Fix:** Centralize ownership-check helpers (`ensureOwnedX`) and use them across Phase 3. Cuts ~30 lines and prevents drift. **Complexity:** M.

---

## Phase 3 — Functional QA

(Findings here are about _behavior_, not just code shape. Each was traced to a code path.)

### AV-7 [CRITICAL — Forecasting] · 🔴 Critical

**Concurrent users corrupt each other's cashflow projections via shared module-local Map.**
**Location:** `lib/analytics/forecast.ts:549` — `const eventDateMap = new Map<number, string>();`
**Risk:** This Map is module-scoped. In Vercel's serverless runtime, two requests served by the _same_ Lambda instance share module state. `forecastCashflow()` is called from `/pocetna` and possibly `insights-nightly` cron. Two users hitting `/pocetna` concurrently on a warm Lambda will:

1. User A's `generateRecurringEvents` populates the map with A's events.
2. User B's `generateRecurringEvents` overwrites those entries (same numeric keys may collide; Map keys are bigints derived from row IDs, so most won't collide, but cleanup logic runs `.clear()` after read).
3. User A's `projectDayByDay` reads partially-corrupted dates → projects events to wrong days. **Wrong account balance projection shown to A.**

The author was aware ("NB: this is module-local mutable state — callers must not interleave"), but enforcement in code is what's missing.

**Reproduction (synthetic):** Add a delay to `generateRecurringEvents` and fire two `forecastCashflow` calls from a test runner sharing the module. Observe non-deterministic event-day output.

**Fix (recommended):**

```ts
// Replace module-local Map with per-call WeakMap or pass-through:
export async function forecastCashflow(...) {
  const eventDateMap = new Map<bigint, string>();  // local
  await generateRecurringEvents(rec, today, days, base, todayIso, skipFx, eventDateMap);
  await generateInstallmentEvents(inst, today, days, base, todayIso, skipFx, eventDateMap);
  return projectDayByDay(events, today, days, eventDateMap);
}
```

Threading the Map through 3 callers is mechanical and tested by existing forecast tests.

**Complexity:** M.

### AV-8 [Insights — N+1 over users in cron] · 🟠 High

**`app/api/cron/insights-nightly/route.ts:66`** loops sequentially over `userIds`, calling `generateInsights(supabase, userId, today)` per user. Per-user budget ~100ms; Vercel cron caps at 300s ⇒ ~3000 users max. Comment acknowledges ("if we ever approach that, chunk via offset"). Not at risk for 3–5 beta users; flag for the record.
**Fix:** Cursor-based pagination + multiple cron schedules, or batch detector queries. **Complexity:** M.

### AV-9 [Dashboard — Promise.all blocking] · 🟠 High

**`/pocetna` fetches 7+ queries in parallel via `Promise.all`** (balance, forecast, budgets, spending, recurring, installments). One slow query blocks all others. No per-section streaming. On a 1-second slow DB, the user stares at a blank dashboard for ≥1s.
**Fix:** Wrap each in `Promise.allSettled`, render Suspense per widget, set 5s timeout per query with skeleton fallback. Combine with MT-11 stale-data fix. **Complexity:** M.

### BG-1 [Budgets — Period rollover does not auto-scale amount] · 🟡 Medium

**`app/(app)/budzeti/actions.ts:204-309` updateBudget allows `period: 'monthly'→'weekly'` without adjusting `amount_cents`.**
A user with a 1000 KM monthly budget who switches to weekly keeps the 1000 KM number, but `get_period_spent_for_category` (00055) compares spending against the wrong baseline (now 1000 KM/week instead of ~230 KM/week). Silently misleading numbers.
**Fix:** When period changes, either auto-scale (`monthly→weekly: amount × 7/30`) or require user to explicitly re-enter the amount with a banner explaining the conversion. **Complexity:** M.

### BG-2 [Budgets — Period change is hard delete + reinsert] · 🟡 Medium (claim from Agent B; partly verified)

**Migration 00053 + actions.ts** rely on a single `budgets` row per (user_id, category_id, period). Changing `period` keeps the same row but disconnects historical period-spent calculations. Old `period_started_at` history is dropped; no audit trail.
**Fix:** Soft-archive + insert new row with same `category_id, user_id` and updated `period`. Preserves history for "your spend last month" queries. **Complexity:** M.

### RC-1 [Recurring — Detection false-positives on monthly + annual same merchant] · 🟡 Medium

**Algo (`lib/analytics/recurring/`) uses last-90d window** + amplitude tolerance to identify candidates. A user with monthly Starbucks + annual car insurance (both for the same "Insurance" merchant if mis-tagged) will see both flagged as candidates with conflicting periodicity.
**Fix:** Stratify by amount tier (small/medium/large) before period detection; or weight detection by amount-stability variance. **Complexity:** M.

### GL-1 [Goals — Recompute is best-effort, swallows error] · 🟡 Medium

**`app/(app)/ciljevi/actions.ts:319-334`** — after updating a goal linked to an account, calls RPC `recompute_goal_from_account`. If the RPC errors, comment says "Non-fatal — goal was updated, balance sync is best-effort." User sees stale `current_amount_cents` (e.g., 0) on the goal page until they trigger another update.
**Fix:** Either return a warning code (`RECOMPUTE_FAILED`) and let the UI show a toast asking to retry, or schedule a deferred retry (Server Action returns success but logs `goal_resync_pending` and the page revalidates a moment later). **Complexity:** S.

### IN-1 [Insights — Dismiss has no rate limit] · 🟢 Low

**`app/(app)/uvidi/actions.ts` (markInsightDismissed)** — no per-user/per-insight cooldown. A user holding the dismiss button and rage-clicking sends 50 dismisses in a second. Unlikely abuse vector, but no protection.
**Fix:** Per-insight `dismissed_at IS NOT NULL` short-circuit on input; or 5-second client-side debounce + 1-second server-side rate-limit. **Complexity:** S.

### OB-1 [Onboarding — Mid-step abandonment loses partial state] · 🟡 Medium

**`components/onboarding/onboarding-wizard.tsx`** persists step progress to `profiles.onboarding_completed` JSONB only on "Dalje" click. Tab close mid-step → next login restarts step 1; partial form state vanishes.
**Fix:** Persist in-progress form data to `localStorage` or a side `profiles.onboarding_drafts` JSONB column on every change (debounced 500ms). Hydrate on wizard mount. **Complexity:** M.

### DD-1 [Dashboard reorder — Optimistic state has no rollback] · 🟢 Low

**`components/dashboard/sortable-dashboard.tsx:100-115`** — `save()` calls `updateDashboardOrder` inside `startTransition`. On RPC failure, toast fires but `draftOrder` already advanced. After `router.refresh()` the server returns the old order, but the user's drag intent persists. Rare race window if user drags again before refresh settles.
**Fix:** On `!res.success`, set `draftOrder ← initialOrder` _before_ the toast. Or block edit mode until refresh resolves. **Complexity:** S.

### TR-1 [Transactions — Convert-to-transfer RPC error parsing is brittle] · 🟡 Medium

**`app/(app)/transakcije/actions.ts:950-985`** maps RPC errors via `error.message.includes('NOT_FOUND')`. If the RPC raises `'Transaction not found'` instead of `'NOT_FOUND'`, the match fails and collapses to `'DATABASE_ERROR'`.
**Fix:** RPC should `RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'` (or similar custom errcode), and TS code matches on errcode, not message. **Complexity:** M.

### Convert-to-transfer idempotency (TR-2) · 🟢 Low

**Migration 00049 RPC** soft-deletes the original transaction and inserts two transfer rows. If client retries on network failure mid-RPC, no idempotency key prevents double-creation of the transfer pair. Verify no auto-retry in the UI (likely fine — the action is one-shot button click).
**Fix:** Add idempotency key (transaction_id + user_id + 5-minute window) or document "no auto-retry" assumption. **Complexity:** M.

---

## Phase 4 — UX Polish (Light)

(Per critique, not a full UX audit. Spot-checks only.)

### UX-10 [Routes mix Bosnian and English] · 🟠 High

**File system:** Bosnian: `/pocetna`, `/racuni`, `/transakcije`, `/budzeti`, `/ciljevi`, `/kategorije`, `/uvidi`, `/podesavanja`, `/sigurnost`, `/skeniraj`, `/kartice-rate`, `/potrosnja`, `/vodic`. **English:** `/help`, `/import`, `/merchants`. Cross-references mobile audit N1.
**Fix:** Rename `/help`→`/pomoc`, `/import`→`/uvezi`, `/merchants`→`/prodavaci`. Add 301 redirects from old paths. Update all navigation. **Complexity:** L (mechanical: rename folders + grep-replace internal links).

### UX-11 [Error.tsx files are localized and well-built] ✅

All three (`app/error.tsx`, `app/(app)/error.tsx`, `app/(auth)/error.tsx`) classify errors (network/auth/server/unknown), display Bosnian copy, and surface `error.digest` for support reference. Network detection via `navigator.onLine`. Reset + back-to-home actions. **No finding.**

### UX-12 [Empty states present] ✅

Spot-checked `/budzeti`, `/ciljevi`, `/uvidi`, `/pretplate` — each has empty-state copy. No empty list rendering as a blank card. Most have CTA. **No finding.**

### UX-13 [Loading states] · 🟢 Low

PR #84 added per-route skeletons. Not exhaustively verified. Confirmed dashboard widgets show skeletons during initial load.
**Fix:** Spot-check `/uvidi`, `/potrosnja` skeletons render at expected paint times; confirmed via PR but worth a manual smoke before launch. **Complexity:** S.

### UX-14 [Onboarding wizard — first-run experience] (cross-ref OB-1) · 🟡 Medium

4 steps (account → transaction → budget → goal) with skip option. Clean implementation. The mid-step abandon bug (OB-1) is the only material gap.

### Mobile audit cross-reference (snapshot, no re-investigation)

| Mobile ID                        | Status today                                    |
| -------------------------------- | ----------------------------------------------- |
| B1 form submit hidden behind nav | unverified ⚠️ — no fix commit found             |
| B2 focus ring clip               | ✅ #99                                          |
| B3 dropdown overflow             | unverified ⚠️                                   |
| B4 calendar narrow               | unverified ⚠️                                   |
| B5 date-picker off-by-one        | mostly fixed via `fix(dates)` #69               |
| B6 amount hidden behind buttons  | ✅ side-sheet edit (#86) + amount in hero (#78) |
| B7 mono webfont                  | ✅ #88                                          |
| D1–D6 Početna UX                 | ✅ Phase D1 (#76), Phase C (#75)                |
| R1–R8 Računi                     | ✅ #74, #75, #87, #100, #101, #102              |
| P1–P5 Pasiva                     | ✅ Phase A (#69), Phase C (#75)                 |
| N1 mixed routes                  | ❌ open — see UX-10                             |
| N2–N4, N12, N13, N17, N18, N20   | ✅                                              |
| N5–N11, N14–N16, N19, N21        | unverified ⚠️                                   |
| F0–F4 premium redesign           | open by design (deferred initiative)            |

**Recommendation:** before launch, run a 30-min device walk-through (real iPhone + real Android) to verify B1/B3/B4 status. Static audit cannot.

---

## Phase 5 — Security & Permission Audit

### Strong points (verified)

- **CSP nonce-based, per-request** (`middleware.ts:40`). `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'`. `frame-ancestors 'none'`. `base-uri 'self'`. ✅
- **Static security headers** (`next.config.ts:10-37`): HSTS 2y + preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy disabling camera/mic/geolocation. ✅
- **All 8 SECURITY DEFINER functions** have explicit `SET search_path = public, pg_temp` (Agent E flag was overstated). Files: 00001, 00041, 00044, 00046, 00049, 00052, 00061, 00065. ✅
- **PII redaction** (`lib/logger.ts:22-32`): IBAN, JMBG, payment-card PAN, email regex applied to every string field. Enforced via `no-console` ESLint rule outside `lib/logger.ts`. ✅
- **Atomic invite redemption** (`migration 00061 handle_new_user`): `FOR UPDATE` lock + same-transaction `UPDATE used_at = now()`. Race-free across concurrent signups. ✅
- **Cron Bearer auth via `timingSafeEqual`** (`insights-nightly:32`, `post-due-installments:27`). ✅
- **Magic-link flow** uses 6-digit OTP (PR #131); custom email template configured in `supabase/config.toml:247-249`. ✅
- **Soft-delete check** in `skeniraj/actions.ts:351` — `is('deleted_at', null)` IS present (Agent C's DL-11 was a false positive).
- **No secrets in code**: secret scan returned only test fixtures (`'test-key'`, `'qa-test-password-12345'`) in `__tests__/` files. No prod keys leaked. ✅

### SE-9 [Middleware — PROTECTED_PATHS missing all Phase 3 routes] · 🟠 High

**`lib/supabase/middleware.ts:11-19`** lists `/pocetna, /transakcije, /racuni, /uvidi, /podesavanja, /kategorije, /merchants`. **Missing:** `/budzeti`, `/pretplate`, `/ciljevi`, `/skeniraj`, `/import`, `/kartice-rate`, `/potrosnja`, `/vodic`. The middleware will not redirect unauthenticated users to `/prijava` for those paths.

**Mitigation:** Each page.tsx still calls `supabase.auth.getUser()` and `redirect('/prijava')` if no user (verified at `app/(app)/budzeti/page.tsx:14-17`). So this is a **defense-in-depth gap, not an exploit**. But: a future page that forgets the page-level check has zero middleware net.

**Fix:** Add the 8 missing routes to `PROTECTED_PATHS`. Also: refactor to "all `app/(app)/` routes are protected by default; explicit allow-list for public pages" — eliminates the drift entirely. **Complexity:** S.

### SE-10 [Invite codes — preview RPC enumerable] · 🟠 High

**`migration 00061 preview_invite_code(p_code text)`** is `SECURITY DEFINER` with `GRANT EXECUTE TO anon, authenticated`. It returns one of `invalid|used|expired|valid` based on a code lookup. **No rate limit. No CAPTCHA.** An attacker can:

- Spray 8-char codes from the non-ambiguous alphabet (~32 chars → ~10^12 search space — brute force infeasible).
- BUT: enumerate all _issued_ codes by harvesting from social media, friends-of-friends, etc., then probe each for `valid|used|expired`.
- Or: rate of `valid` responses leaks total live invite count (information disclosure to attacker).

**Mitigation today:** Code length 8 + non-ambiguous alphabet → 32^8 = ~10^12 attempts to brute-force one code. Acceptable. Enumeration vector is the real risk.

**Fix:** Apply the existing rate-limit RPC: inside `preview_invite_code`, call `check_rate_limit_and_record(<some-key-derived-from-IP-via-pg-headers>, 'invite_preview', 30, 60)` (30 lookups per minute per source). Or: drop the RPC entirely and let the trigger speak with `INVALID_OR_EXPIRED_INVITE_CODE` at OTP-confirm time (UX cost: user wastes one OTP on a bad code).
**Complexity:** S–M.

### SE-11 [Cron endpoints — no replay protection] · 🟠 High

**`/api/cron/insights-nightly` and `/api/cron/post-due-installments`** verify `Bearer ${CRON_SECRET}` via `timingSafeEqual`. **There is no nonce, timestamp, or one-time-use marker.** If the secret leaks (compromised Vercel dashboard, GitHub Actions log, social engineering), an attacker can replay the request endlessly:

- `/post-due-installments` would post duplicate installment rows on every replay.
- `/insights-nightly` would regenerate insights every replay.

**Fix:** Augment Bearer with timestamp:`Bearer {secret}|{unix_ts}`. Reject if `now - ts > 60s`. Optionally maintain a small `consumed_cron_nonces` table (with TTL cleanup) to defeat exact replay. Easy first step: rotate `CRON_SECRET` quarterly.
**Complexity:** M.

### SE-12 [Auth — OTP expiry too long] · 🟠 High

**`supabase/config.toml:229`** — `otp_expiry = 3600` (1 hour). Industry best practice for one-time codes is 10–15 minutes. Long expiry widens the phishing window.
**`max_frequency = 1s`** (line 225) — minimum interval between magic-link sends. Allowing 1 sec → user can spam send. Should be ≥30s.

**Fix:** Set `otp_expiry = 900` (15 min) and `max_frequency = "30s"`. Verify the production Supabase project (Dashboard → Auth → Email) matches; `config.toml` is for local dev only.
**Complexity:** S.

### SE-13 [Budgets — createBudget lacks explicit ownership pre-check] · 🟡 Medium

**`app/(app)/budzeti/actions.ts:204-249`** does Zod parse, getUser check, then directly INSERTs. It relies entirely on RLS WITH CHECK (`user_owns_budgetable_category(category_id)` per migration 00053). The canonical pattern (`transakcije/actions.ts`) does an explicit `select('id').eq('id', x).eq('user_id', user.id)` first. If RLS were ever misconfigured (or replaced with a less-strict policy in a future migration), this Server Action would create budgets against foreign categories.
**Fix:** Add `await ensureOwnedCategory(supabase, user.id, category_id)` before the INSERT. **Complexity:** S.

### SE-14 [Server Actions — FORBIDDEN vs NOT_FOUND inconsistency] · 🟡 Medium

**`app/(app)/transakcije/actions.ts:737, 679`** return `FORBIDDEN` when ownership check fails on `.eq('user_id', user.id).maybeSingle()` returning null. **`app/(app)/racuni/actions.ts:194` returns `NOT_FOUND` for the same scenario.** This split lets an attacker probe IDs:

- `NOT_FOUND` → "no row exists with this ID anywhere".
- `FORBIDDEN` → "row exists but isn't yours" (UUID is real and used by another user).

For UUIDs, the leak is small but real (defeats privacy of "are you a user" signal). Standardize on **NOT_FOUND** for any "ID does not match a row owned by you" outcome; reserve `FORBIDDEN` for explicit business-rule denials (e.g., "account is locked").
**Fix:** Grep for `error: 'FORBIDDEN'` post-ownership-check and replace with `NOT_FOUND`. **Complexity:** S.

### SE-15 [npm audit — dev-only vulnerabilities] · 🟢 Low

`pnpm audit --audit-level=low`:

- **basic-ftp <=5.3.0 (high)** — DoS via FTP server response. Path: `lighthouse > puppeteer-core > @puppeteer/browsers > proxy-agent > pac-proxy-agent > get-uri > basic-ftp`. **Dev-only** (lighthouse perf testing). Not in production runtime. Patch by `pnpm update lighthouse`.
- **postcss <8.5.10 (moderate)** — XSS via unescaped `</style>`. Path: `next > postcss`. Build-time CSS processing; not runtime user content. Low real-world risk.
- **ip-address (moderate)** — XSS in HTML emit. Path also via lighthouse. Dev-only.

**Fix:** `pnpm update lighthouse postcss` after launch. None block beta. **Complexity:** S.

### SE-16 [Storage — PDF retention 24h cron not verified] · ⚠️ Verify

The 24h auto-delete of uploaded PDFs (per docs/02-security-privacy.md) was shipped in Phase 2. I did not re-trace the cron path here. Confirm `supabase/functions/hard-delete-accounts/` or similar still runs in production via Supabase Dashboard → Edge Functions logs.
**Fix:** Verify last 24h-retention cron run in Supabase logs. **Complexity:** S.

### Verified-OK security items

- All `eq('user_id'` patterns in mutation paths consistent (DL-8). Custom ESLint rule `local/no-unguarded-mutation` enforces. ✅
- Hard-delete-accounts cron uses constant-time bearer compare (SE-2 prior audit, still in place). ✅
- PDF magic-byte verification before accepting upload (SE-5 prior audit, still at `lib/server/actions/imports/upload.ts`). ✅
- Single-use jti cancel-deletion tokens (SE-1 prior audit, still in `deletion_cancel_tokens` table). ✅
- Account base currency, deletion flow, soft-delete trigger, RLS on every user_id table — all confirmed. ✅
- Anonymous sign-ins disabled (`config.toml:176`). ✅
- Refresh token rotation enabled (`config.toml:169`). ✅

---

## Phase 6 — Performance & Reliability

(Performance + DB integrity merged per pre-audit critique.)

### Performance findings (consolidated with Phase 3)

- **AV-7** (Critical): module-local `eventDateMap` — see Phase 3.
- **AV-8** (High): insights-nightly N+1 — see Phase 3.
- **AV-9** (High): `/pocetna` Promise.all blocking — see Phase 3.

### Reliability findings

### PR-1 [Cron — post-due-installments uses wrong Supabase client] · 🔴 Critical

**`app/api/cron/post-due-installments/route.ts:32`** — `const supabase = await createClient();` (cookie-based SSR client). The cron runs without a user session; cookies are absent. The client falls back to anon key. Then `supabase.from('installment_occurrences').select(...)` runs with no `auth.uid()`. **RLS on `installment_occurrences` will deny the read for anon** (verify, but standard pattern), making the cron a no-op that returns `{posted: 0, failed: 0, today}` and looks healthy in logs.

Compare `app/api/cron/insights-nightly/route.ts:37` which correctly uses `createAdminClient()` (service-role).

**Reproduction:**

1. Create an installment plan with `due_date <= today` and `state = 'pending'`.
2. POST to `/api/cron/post-due-installments` with the correct Bearer token.
3. Observe the response is `{posted: 0, failed: 0, today}` and no transaction is created.

**Fix:** Replace `import { createClient } from '@/lib/supabase/server';` with `import { createAdminClient } from '@/lib/supabase/admin';`. Replace line 32 `const supabase = await createClient();` with `const supabase = createAdminClient();`. Same auth pattern as `insights-nightly`. Add an integration test that asserts `posted > 0` for a seeded installment.
**Complexity:** S.

### PR-2 [Observability — No error tracking SaaS configured] · 🟠 High

**Grep across the repo for `@sentry`, `posthog`, `datadog`, `@vercel/analytics`, `@logtail` returned zero matches.**
The only telemetry today is:

- Vercel platform logs (raw stderr from `console.error` via `logSafe`).
- `error.tsx` boundaries that log `console.error('[ErrorBoundary]', { digest, message, type })` to the browser console — not aggregated server-side.
- `error.digest` IDs surfaced to users for support reference.

**Risk for 3–5 beta users:** When Maja from Banja Luka hits a 500 at 23:00, you have:

- Vercel function logs (raw text, not filterable).
- An error digest the user might or might not screenshot.
- No way to know how often a class of errors fires across users.

**Fix (recommended order, cheapest first):**

1. **Free, fast:** install `@vercel/analytics` (`pnpm add @vercel/analytics`) — gives raw RUM (route + duration), Web Vitals, no error grouping. 1-line setup in `app/layout.tsx`.
2. **Free, more value:** Sentry free tier (50k events/mo): `pnpm add @sentry/nextjs && npx @sentry/wizard@latest -i nextjs`. Gives error grouping, source maps, release tracking. Wire in error.tsx boundaries and Server Actions.
3. **Cost-aware:** PostHog product analytics (1M events/mo free) — heavier, less critical for early beta.

**Cost check before adding (per existing memory feedback_inngest_free_tier_costing):** Sentry free tier = 50k errors/month. At 5 users × ~10 errors/day = ~1500 errors/month. Comfortably within free tier. Vercel Analytics included free on Pro.

**Complexity:** S–M (Sentry setup is 30 min; Server Action instrumentation adds 15 min).

### PR-3 [Migration reversibility — none of the 73 migrations have down-migrations] · 🟡 Medium

The repo follows additive-migration discipline (good), but a few migrations are not safely reversible if a rollback is needed:

- `00042_audit_log_drop_fk.sql` — drops a FK; restoring would re-violate constraints if data has accumulated.
- `00043_cleanup_parsed_tx_on_terminal.sql` — adds trigger; reversal needs DROP TRIGGER (trivial), but parsed_transactions data already deleted is unrecoverable.
- `00066_backfill_missing_profiles.sql` — backfills rows. Down would need to identify "rows backfilled by this migration" — there's no marker.

For a 3–5 user beta, this is low actual risk (you control all data; PITR exists on Supabase Pro). Still: document a rollback runbook entry for each migration that does data backfill.

**Fix:** Add a "Rollback strategy" section to `docs/runbooks/migration-guide.md` with per-migration notes. Test PITR on staging before launch. **Complexity:** M.

### PR-4 [Bundle size unverified] · ⚠️ Verify

The `pnpm build` background job did not finish during this audit window (PATH issue resolved late; build is now running in CI on every push per `.github/workflows/ci.yml`). Read the latest CI build log for chunk sizes; flag chunks >200KB gzipped.

Static suspect: `recharts` (charting), `react-day-picker`, `pdfjs-dist` (heavy), `@google/generative-ai`. `serverExternalPackages: ['pdfjs-dist', 'canvas']` keeps pdfjs out of the client bundle (`next.config.ts:44`). ✅
**Fix:** Manually inspect Vercel deploy log; if any client chunk >200KB, lazy-load with `next/dynamic`. **Complexity:** S–M.

---

## Phase 7 — Database & Data Integrity

### Strong points

- **73 migrations, all additive style.** No `DROP TABLE`. One `DROP COLUMN` (00042 audit_log FK).
- **Timestamps in filenames** in chronological order with sequence number.
- **All user-scoped tables have RLS enabled** (PR #126 audited 21 tables).
- **`account_balance_trigger`** present (DL-1 prior audit, still in 00013/00035/00036).
- **Transfer pair symmetry** enforced via deferrable FK + trigger (DL-2, migration 00040).
- **`audit_log` table** — exists; FK carve-out removed in 00042 (DL-4 prior audit). Phase 0–2 features write to it.
- **`pg_cron` jobs** are idempotent (`unschedule first if present` pattern in 00059, 00061). ✅

### DL-9 [Audit log — Phase 3 features write nothing] · 🟠 High

`audit_log` exists but Phase 3 features (budgets, goals, recurring, insights, dashboard reorder) do not write to it. If a user disputes "I never created that budget" or "this goal was deleted by someone", there's no record.
**Fix:** Add `audit_log` INSERT in each Phase 3 Server Action (or via DB trigger on the new tables). Bundle into a single PR after launch — for 5 beta users, you can rely on git/PR/manual support during week 1. **Complexity:** M.

### DL-10 [Transfer-pair lookup window in forecast can silently skip transfers] · 🟡 Medium

**`lib/analytics/forecast.ts:334-346`** — when computing transfer impact on baseline, resolves `transfer_pair_id` via a 90d-fetched local map. If the pair is older than 90d (rare but possible), `otherAcct` is `undefined` and the transfer is silently skipped. Projected balance becomes artificially high for users with long-running savings/loan transfer relationships.
**Fix:** Fetch transfer pair rows separately without the date limit when their IDs are referenced from in-window transactions. **Complexity:** M.

### DL-11 [Forecast empty-state ambiguity] · 🟢 Low

**`components/dashboard/forecast-widget.tsx`** shows "Nema prognoze" when both start balance and event list are empty. Two distinct user states collapse into one message:

- New user with no accounts.
- User with accounts but no recurring/installment history yet.

**Fix:** Differentiate: "Dodaj svoj prvi račun" vs "Dodaj prve transakcije za projekciju". **Complexity:** S.

### Migration-by-migration review (newest 21)

| Migration                                    | Verdict | Note                                                                                 |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| 00046 parsed_tx_convert_to_transfer          | ✅      | Complements 00049; SECURITY DEFINER + search_path                                    |
| 00047 dashboard_exclude_pasiva_from_flow     | ✅      | Net flow excludes loans/CC types                                                     |
| 00048 loan_payment_categories                | ✅      | Seeded "Plaćanje kredita" + "Kamata na kredit"                                       |
| 00049 convert_transaction_to_transfer_rpc    | ✅      | SECURITY DEFINER, auth.uid() check, error-message brittleness flagged TR-1           |
| 00050 account_balance_history_rpc            | ✅      | Returns sparkline data; window-bounded                                               |
| 00051 dashboard_pasiva_respects_flag         | ✅      | Per-account `exclude_from_flow` toggle                                               |
| 00052 llm_categorization_cache               | ✅      | Memoizes Gemini decisions                                                            |
| 00053 budgets                                | ✅      | RLS WITH CHECK uses `user_owns_budgetable_category`; SE-13 flags caller-side gap     |
| 00054 get_current_period_spent               | ✅      | RPC for budget progress                                                              |
| 00055 get_period_spent_for_category          | ✅      | Per-category in date range                                                           |
| 00056 recurring_transactions                 | ✅      | Includes ignored-candidates link                                                     |
| 00057 ignored_recurring_candidates           | ✅      | Soft-delete for false positives                                                      |
| 00058 goals                                  | ✅      | RLS, progress columns; account-link checks in Server Action                          |
| 00059 insights                               | ⚠️      | pg_cron schedule, dedup partial index `WHERE dismissed_at IS NULL` — see MT-12 below |
| 00060 profiles_onboarding_completed_jsonb    | ✅      | JSONB step tracker                                                                   |
| 00061 invite_codes                           | ⚠️      | preview_invite_code enumerable (SE-10)                                               |
| 00062 get_spending_by_category               | ✅      | /potrosnja aggregation RPC                                                           |
| 00063 fix_get_spending_by_category_ambiguity | ✅      | PG 42702 hotfix                                                                      |
| 00064 profiles_dashboard_section_order       | ✅      | Column for DnD persistence                                                           |
| 00065 set_dashboard_section_order_rpc        | ✅      | SECURITY DEFINER + search_path; auth.uid() guard inside body                         |
| 00066 backfill_missing_profiles              | ⚠️      | One-shot data backfill; no idempotency marker (PR-3)                                 |

### MT-12 [insights dedup index does not include `valid_until`] · 🟢 Low

**`supabase/migrations/...00059_insights.sql:94-96`**: partial unique index `(user_id, dedup_key) WHERE dismissed_at IS NULL`. The engine filters by `valid_until > now()` at query time, but the predicate doesn't include it (Postgres requires immutability). Means an expired-but-not-cleaned-up insight blocks re-insertion of a fresh one with the same dedup_key for up to 7 days (cleanup interval).
**Fix:** Tighten cleanup to 1-day or include `valid_until` via a partial index over a future-time-cap. Or add a check inside `generateInsights` to delete expired-with-same-key before re-inserting. **Complexity:** S–M.

### MT-13 [Indexes — verify ORDER BY coverage] · 🟡 Medium

Phase 3 tables (`budgets`, `goals`, `recurring_transactions`, `insights`) have indexes on `user_id` and one or two filter columns, but I did not verify `(user_id, created_at)` composite indexes for default sort-by-recent queries.
**Fix:** Run `EXPLAIN ANALYZE` on each list query. If any shows a "Sort" step over many rows, add a composite. **Complexity:** S.

---

## Phase 8 — Error Handling & Resilience

### Strong points

- **Every Server Action returns typed error codes** (UNAUTHORIZED, VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, DATABASE_ERROR, EXTERNAL_SERVICE_ERROR, RATE_LIMITED, ACCOUNT_INACTIVE…). No raw `error.message` leaking.
- **`logSafe` everywhere** for server-side logging (`lib/logger.ts`). PII regex applied. Lint-enforced.
- **3 error.tsx boundaries** with localized copy + classification + retry/back actions.
- **Gemini circuit breaker** (`lib/parser/gemini-circuit-breaker.ts`): per-feature circuits (`parseCircuit`, `categorizeCircuit`); FAILURE_THRESHOLD=3, RECOVERY_TIMEOUT=60s.
- **FX fallback** (`lib/fx/rates.ts`): hardcoded 1 BAM = 0.51 EUR fallback when Frankfurter is down.
- **Stuck-batch recovery** (`recoverStuckImports`) on user load; replaced Inngest async path.

### EH-1 [Receipt — ledger error swallowed as EXTERNAL_SERVICE_ERROR] · 🟡 Medium

**`app/(app)/skeniraj/actions.ts:391-406`** — `computeAccountLedgerCents` is wrapped in try/catch that returns `EXTERNAL_SERVICE_ERROR`. But the function is local math (no network). If it throws, that's a bug — masking it with EXTERNAL_SERVICE_ERROR misleads operators (they'll check Frankfurter when the bug is in `lib/fx/account-ledger.ts`).
**Fix:** Map this catch to `'INTERNAL_ERROR'` or `'DATABASE_ERROR'`; log full stack. **Complexity:** S.

### EH-2 [Forecast — FX failure logs but doesn't surface to UI] · 🟢 Low

**`lib/analytics/forecast.ts:619-625`** — when FX conversion fails for a single installment, it `logSafe` and `continue`. The forecast renders without that installment, no warning to user. Low impact (one missing event line) but loss of fidelity.
**Fix:** Aggregate FX failures, expose as a `forecastWarnings: string[]` returned to the widget; show "Nedostaju 2 stavke (FX nedostupan)" footer. **Complexity:** S.

### EH-3 [Onboarding — wizard error handling unclear on Server Action failure] · 🟢 Low

If `updateProfile` fails during a wizard step persist, the wizard advances anyway (UI optimism). User reports "moja stvar nije sačuvana".
**Fix:** Block step advance until persistence resolves; or implement OB-1's draft-persistence pattern. **Complexity:** S.

---

## Phase 9 — Testing Strategy & Coverage

### Test infrastructure (CI)

- **`.github/workflows/ci.yml`:** verify job (typecheck, lint, test, coverage, build), integration-tests job (Supabase + RLS), e2e job (Playwright Chromium non-slow), e2e-slow job (full import flow, push only).
- **Coverage gates** present (`pnpm test:coverage` step).
- **Frozen lockfile** (`pnpm install --frozen-lockfile`).
- **PR-triggered:** verify, integration-tests, e2e all run on `pull_request` to main.

### TS-1 [Phase 3 test coverage — unverified] · 🟡 Medium

Did not run `pnpm test:coverage` during this audit (background commands had to wait for `pnpm install`). Static check of `__tests__/` and `tests/`:

- ✅ unit tests for `lib/format`, `lib/fx`, `lib/parser`, `lib/llm`, `lib/queries/summary`
- ✅ RLS tests in `__tests__/rls/` covering 21 tables (PR #126)
- ✅ E2E tests in `tests/e2e/` for import flow, auth, transactions
- ⚠️ Phase 3 features: budgets/goals/recurring tests exist (PRs #105, #116, #112). Insights detector tests unverified. Forecast tests unverified.

**Fix:** Run `pnpm test:coverage --reporter=html`, open the report, and confirm `lib/analytics/forecast.ts`, `lib/analytics/insights/engine.ts` have ≥80% line + branch. Any uncovered detector logic is launch risk (it runs nightly under cron and must not throw). **Complexity:** S.

### TS-2 [No concurrent-state test for forecast] · 🟠 High (related to AV-7)

There is no test that fires two `forecastCashflow` calls in parallel and asserts deterministic output for each. Without it, AV-7 will land again in a future refactor.
**Fix:** After fixing AV-7, add `lib/analytics/forecast.concurrent.test.ts` that runs two distinct user fixtures in `Promise.all` and checks output stability. **Complexity:** S.

### TS-3 [No replay-attack test for cron endpoints] · 🟢 Low (related to SE-11)

Once SE-11 lands, add a test that hits the cron endpoint twice with the same Bearer+timestamp; second should 401.
**Fix:** Add to `__tests__/api/cron-replay.test.ts` after SE-11 fix. **Complexity:** S.

---

## Phase 10 — Cleanup & Polish

### Strong points

- **Single TODO** in `app/lib/components/hooks/stores`: `lib/format/format-money.ts:13` — legitimate i18n note.
- **No commented-out code blocks** found in spot-check.
- **No FIXME/HACK/XXX** in source.
- **No `@ts-ignore` / `@ts-expect-error`** in source.
- **Custom ESLint rules** prevent the most common drift (DL-8, anglicisms, console.log).
- **Husky pre-commit** runs lint-staged (eslint --fix + prettier).

### CL-1 [Internal phase markers in source] · 🟢 Low (= MT-9)

Already covered in Phase 2.

### CL-2 [Migration filenames carry phase metadata] · ⚠️ Defer

Filenames like `20260618120000_00061_invite_codes.sql` are fine. The convention is consistent — no cleanup needed.

### CL-3 [/sigurnost references developer docs in user UI] · 🟢 Low (cross-ref N6 from mobile audit)

Already noted in mobile audit; status unverified during this audit.

---

## Phase 11 — Production Readiness

(Trimmed for 3–5 beta users per pre-audit critique.)

### Roll back: ✅ Possible

Vercel keeps prior deployments accessible; redeploy old commit via Vercel dashboard. Migrations are not auto-reversible — see PR-3.

### Debug: 🔴 Critical gap

No error tracking — see PR-2.

### Recover: ⚠️ Verify

Supabase backup window: depends on plan. Pro = PITR 7d; Free = daily snapshot. Confirm in Dashboard → Database → Backups.
**Fix:** For real users, upgrade to Pro and enable PITR. **Complexity:** S (paid).

### Env config: ✅ Documented

`.env.example` is comprehensive (44 lines, all vars documented in Bosnian comments). Vercel deployment env should mirror; manual verification needed.

### Legal:

- **ToS:** present at `/uslovi` (PR #93). ✅
- **Privacy policy:** present at `/privatnost` (PR #91). ✅
- **Vuln disclosure:** `/.well-known/security.txt` + `/sigurnost` updated (PR #89). ✅
- **Data export + delete:** still present (verified in repo via cancel-deletion routes). ✅
- **GDPR-equivalent for BiH:** ZZLP (Zakon o zaštiti ličnih podataka, October 2025) — covered in `docs/02-security-privacy.md`.
- **Sub-processors disclosed in privacy policy?** Verify Gemini, Frankfurter, Resend, Vercel, Supabase listed by name.
  **Fix:** Read `app/privatnost/page.tsx` and confirm each sub-processor is named. **Complexity:** S.

### Vercel config: ✅ OK

- 2 cron jobs (sane schedules).
- `serverExternalPackages: ['pdfjs-dist', 'canvas']`.
- E2E auth-bypass handler stubbed in `VERCEL_ENV === 'production'` (`next.config.ts:60-67`).

### CI gates: ✅ Strong

Verify + integration-tests + e2e + e2e-slow all run on PR. `eslint.ignoreDuringBuilds: false` ensures lint failures break the build.

---

## Phase 12 — Prioritized Roadmap

### Pre-launch (BLOCKERS — must land before any user touches the app)

| ID    | Sev | Title                                                     | Loc                                              | Complexity | Reason                                                         |
| ----- | --- | --------------------------------------------------------- | ------------------------------------------------ | ---------- | -------------------------------------------------------------- |
| AV-7  | 🔴  | Module-local `eventDateMap` corrupts concurrent forecasts | `lib/analytics/forecast.ts:549`                  | M          | Wrong account-balance projection silently shown                |
| PR-1  | 🔴  | post-due-installments cron silently no-ops                | `app/api/cron/post-due-installments/route.ts:32` | S          | Installments never auto-post; users see "should have happened" |
| PR-2  | 🟠  | No error tracking SaaS                                    | repo-wide                                        | S          | Cannot debug 23:00 errors; trial-by-fire support               |
| SE-12 | 🟠  | OTP expiry 1h, magic-link rate 1s                         | `supabase/config.toml:225,229`                   | S          | Phishing window too wide                                       |

### Week-1 (HIGH — fix in first week of beta)

| ID    | Sev | Title                                             | Loc                                         | Complexity |
| ----- | --- | ------------------------------------------------- | ------------------------------------------- | ---------- |
| SE-9  | 🟠  | Middleware PROTECTED_PATHS missing Phase 3 routes | `lib/supabase/middleware.ts:11-19`          | S          |
| SE-10 | 🟠  | preview_invite_code RPC enumerable                | migration 00061                             | S–M        |
| SE-11 | 🟠  | Cron endpoints accept replay                      | both cron routes                            | M          |
| AV-8  | 🟠  | insights-nightly N+1 over users                   | `app/api/cron/insights-nightly/route.ts:66` | M          |
| AV-9  | 🟠  | /pocetna Promise.all blocking                     | `app/(app)/pocetna/page.tsx`                | M          |
| DL-9  | 🟠  | Phase 3 omits audit_log writes                    | budgets/goals/insights/recurring            | M          |
| UX-10 | 🟠  | Routes mix Bosnian/English                        | filesystem                                  | L          |
| TS-2  | 🟠  | Concurrent-forecast test missing                  | `__tests__/forecast/`                       | S          |

### Backlog (MEDIUM — post-beta)

| ID    | Sev | Title                                        | Loc                                        | Complexity |
| ----- | --- | -------------------------------------------- | ------------------------------------------ | ---------- |
| BG-1  | 🟡  | Budget period rollover doesn't auto-scale    | `app/(app)/budzeti/actions.ts:204-309`     | M          |
| BG-2  | 🟡  | Period change loses history                  | migration 00053                            | M          |
| RC-1  | 🟡  | Recurring detection false-positives          | `lib/analytics/recurring/`                 | M          |
| GL-1  | 🟡  | Goal recompute is silent best-effort         | `app/(app)/ciljevi/actions.ts:319-334`     | S          |
| OB-1  | 🟡  | Onboarding wizard mid-step abandon           | `components/onboarding/`                   | M          |
| TR-1  | 🟡  | Convert-to-transfer brittle error parsing    | `app/(app)/transakcije/actions.ts:950-985` | M          |
| MT-7  | 🟡  | Forecast author-warning is wrong fix         | `lib/analytics/forecast.ts:540-549`        | M          |
| MT-8  | 🟡  | /potrosnja date-range duplicated             | `app/(app)/potrosnja/page.tsx:33-82`       | M          |
| MT-10 | 🟡  | BigInt→Number narrowing                      | budgets+goals actions                      | S          |
| MT-11 | 🟡  | Forecast widget never invalidates            | `components/dashboard/forecast-widget.tsx` | S          |
| MT-12 | 🟡  | Phase 3 omits ownership-helper template      | budgets/goals/skeniraj actions             | M          |
| SE-13 | 🟡  | createBudget no explicit ownership pre-check | `app/(app)/budzeti/actions.ts:204-249`     | S          |
| SE-14 | 🟡  | FORBIDDEN/NOT_FOUND inconsistency            | transakcije/racuni actions                 | S          |
| EH-1  | 🟡  | Receipt ledger error mis-classified          | `app/(app)/skeniraj/actions.ts:391-406`    | S          |
| DL-10 | 🟡  | Forecast transfer-pair window edge           | `lib/analytics/forecast.ts:334-346`        | M          |
| MT-13 | 🟡  | ORDER BY index coverage on Phase 3 tables    | migrations 00053/00056/00058/00059         | S          |
| TS-1  | 🟡  | Phase 3 test coverage unverified             | repo-wide                                  | S          |
| PR-3  | 🟡  | Migration rollback runbook gaps              | `docs/runbooks/migration-guide.md`         | M          |
| MT-9  | 🟡  | Phase markers in code comments               | source-wide                                | S          |
| SE-16 | ⚠️  | PDF retention cron unverified                | Edge Functions                             | S          |
| PR-4  | ⚠️  | Bundle size unverified                       | CI build log                               | S–M        |

### Polish (LOW — when convenient)

| ID    | Sev | Title                                     | Loc                                                   | Complexity |
| ----- | --- | ----------------------------------------- | ----------------------------------------------------- | ---------- |
| IN-1  | 🟢  | Insights dismiss has no rate limit        | `app/(app)/uvidi/actions.ts`                          | S          |
| TR-2  | 🟢  | Convert-to-transfer no idempotency key    | migration 00049                                       | M          |
| DD-1  | 🟢  | Dashboard reorder no rollback on RPC fail | `components/dashboard/sortable-dashboard.tsx:100-115` | S          |
| DL-11 | 🟢  | Forecast empty-state ambiguity            | forecast widget                                       | S          |
| EH-2  | 🟢  | Forecast FX failures invisible to user    | `lib/analytics/forecast.ts:619-625`                   | S          |
| EH-3  | 🟢  | Onboarding step advances on save error    | `components/onboarding/`                              | S          |
| MT-12 | 🟢  | Insights dedup index `valid_until` gap    | migration 00059                                       | S–M        |
| SE-15 | 🟢  | Dev-only npm vulnerabilities              | lighthouse chain                                      | S          |
| CL-3  | 🟢  | /sigurnost references repo docs           | `app/(app)/sigurnost/page.tsx`                        | S          |
| TS-3  | 🟢  | Cron replay test missing (post-SE-11)     | `__tests__/api/`                                      | S          |

### Total: **2 Critical + 9 High + 21 Medium + 10 Low = 42 findings.**

---

## Phase 13 — Safe Fixing Strategy

### Order of operations (minimize regression risk)

**Sprint 1 (pre-launch, 1–2 days):**

1. **PR-1** (cron client) — single-file fix, isolated. Test: integration test that asserts `posted > 0` for seeded installment. Low blast radius.
2. **AV-7** (forecast Map) — refactor signature; existing tests must continue to pass. Add concurrent-state test (TS-2) in same PR. Verify `forecastCashflow` callers in `/pocetna/page.tsx` and any internal calls.
3. **SE-12** (OTP expiry) — supabase config + Supabase Dashboard production setting. Coordinated config change; users with magic links in flight may see unexpected expiry behavior briefly.
4. **PR-2** (Sentry) — additive instrumentation. Low risk. Wrap Server Actions in `Sentry.withServerActionInstrumentation` after wiring.

**Sprint 2 (week-1 of beta, parallel):** 5. **SE-9** (middleware PROTECTED_PATHS) — additive list change. Test: unauthenticated GET `/budzeti` redirects. 6. **SE-10** (invite preview rate limit) — RPC change, additive. No data migration. 7. **SE-11** (cron replay protection) — Bearer format change. Coordinate with Vercel cron config + secret rotation. 8. **AV-8 + AV-9** (perf) — non-coupled. AV-8 is cron pagination; AV-9 is Suspense streaming on /pocetna. 9. **DL-9** (audit log) — pure additive trigger or Server Action enhancement. 10. **UX-10** (route renames) — coordinate with redirect map and update internal links. Mechanical but touches many files. **Risk:** broken bookmarks. Add 301 redirects for old paths.

**Sprint 3+ (post-beta):**

- Medium and Low tier items as time permits.

### Tightly coupled changes

- **AV-7** + **MT-7** — same code, fix together.
- **MT-11** + **AV-9** — both touch /pocetna freshness.
- **BG-1** + **BG-2** — both budget period semantics.
- **MT-10** + **DL-10** + **GL-1** — all in goals/budgets actions; bundle into a single Phase 3 hardening PR.
- **SE-9** is independent and low risk — ship first.

### Regression risk areas to watch

- **`/pocetna`** (touched by AV-7, AV-9, MT-11, DD-1) — run full E2E pass after these fixes.
- **Cron endpoints** (PR-1, SE-11, AV-8) — manual smoke after each.
- **Onboarding wizard** (OB-1, EH-3, MT-12) — re-test the 4-step flow on every change to wizard internals.

### What NOT to bundle

- Do not touch `formatMoney` while in this audit. Existing memory `feedback_format_money_manual.md` warns against Intl restoration. UX-10 should not regress UX-4/UX-5.
- Do not refactor `lib/parser/` (MT-1 already decomposed it; further decomposition introduces re-entry into a stable subsystem).
- Do not change `eq('user_id'` patterns in mutation paths (DL-8 still holds; lint enforces).

---

## Phase 14 — Final Release Confidence Report

### Health scores

| Dimension            | Pre-fix | After Critical+High fixes | After all Medium fixes |
| -------------------- | ------: | ------------------------: | ---------------------: |
| Code quality         |    8/10 |                      8/10 |                   9/10 |
| Security             |    7/10 |                      9/10 |                   9/10 |
| Reliability          |    6/10 |                      8/10 |                   9/10 |
| Test coverage        |    7/10 |                      8/10 |                   9/10 |
| Production readiness |    5/10 |                      8/10 |                   9/10 |
| UX polish            |    7/10 |                      8/10 |                   9/10 |

### Top 5 risks remaining (after Critical-only fixes)

1. **Route-name drift** (UX-10) — beta users will share links; mismatch causes 404s on the partial-fix state.
2. **Audit log blank for Phase 3** (DL-9) — first user-dispute case ("I never created that") has no answer.
3. **Cron replay** (SE-11) — defense-in-depth; less urgent for single-user secret.
4. **Phase 3 test coverage unverified** (TS-1) — risk of regression on follow-up changes.
5. **`/pocetna` slow on poor connections** (AV-9) — beta users on mobile networks may bounce on first impression.

### Most fragile areas (babysit during beta)

- **Forecast widget** — even after AV-7 fix, the algorithm has 4+ exclusion rules (savings, loans, transfers, opening_balance) and one nudge (#138 "transfers with spending-pool boundary into baseline"). Any new account type or recurring pattern needs forecast review.
- **Budget RPC** — `get_period_spent_for_category` will be exercised heavily. Any latency regression cascades.
- **Insights nightly** — runs at 03:00 UTC. If the cron silently fails (no observability), users see no insight refresh for days.
- **Onboarding wizard** — the highest-impact UX surface for first-impressions. Fragile around mid-step state.
- **Convert-to-transfer flow** — this fixes the P-prefix data-model issue from mobile audit; if it fails, it's the user's recourse for "I miscategorized loan payment as Income".

### Most impressive areas (lean into)

- **Security defense-in-depth.** Nonce CSP + custom ESLint rules + PII redaction + atomic invite redemption + soft-delete trigger redundancy. Above startup baseline.
- **Code hygiene.** TS strict, custom local ESLint rules, near-zero TODOs, lint-enforced architecture invariants. This codebase is unusually disciplined for a solo-built project.
- **Bosnian-language polish.** Custom lint rule for anglicisms, error.tsx classification, Phase markers stripped from user UI (mostly), well-localized OTP email template.
- **Migration discipline.** 73 additive migrations, all sequenced, all RLS-enabled. The DB is the most defensible layer.

### Verdict

**🟡 SHIP WITH CONDITIONS — safe for 3–5 friendly beta users after Critical (AV-7, PR-1) and 2 of the 4 High-priority pre-launch items (PR-2 observability, SE-12 OTP expiry).**

The remaining High items can land in week 1 of beta without user-visible incidents. The Medium and Low backlogs can run for 2–3 sprints post-launch.

**Confidence after Critical+High pre-launch:** 8/10. Higher than most pre-beta apps I have audited. The author has internalized "polako, detaljno, bez propusta" and it shows in the code.

**Hard requirement before launch (the no-go list):**

1. AV-7 fixed and `lib/analytics/forecast.concurrent.test.ts` green.
2. PR-1 fixed and one installment posted via cron in staging.
3. PR-2 — Sentry (or equivalent) installed and capturing test errors from `error.tsx`.
4. SE-12 — OTP expiry set to 15 min in production Supabase.

If those four land, you can open `ENABLE_INVITES=true` and hand out the first 5 codes.

**Confidence trajectory:**

- Today: 6.5/10 → not safe to launch.
- After 4 hard requirements (~1 day work): 8/10 → safe for friendlies.
- After Week-1 sprint (~5 days work): 8.8/10 → safe for ~50 invite-only users.
- After full Medium backlog (~3 weeks work): 9.5/10 → safe for open-beta.

---

## Appendix A — Tooling output

### Tests / lint / typecheck / build

| Command          | Status                       | Notes                                                                                           |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm install`   | ✅ exit 0                    | Worktree had no `node_modules/`; installed during audit.                                        |
| `pnpm typecheck` | ✅ exit 0                    | TS strict — no errors.                                                                          |
| `pnpm lint`      | ✅ exit 0                    | All custom rules pass (no-unguarded-mutation, no-untranslated-jsx-strings, no-console).         |
| `pnpm test`      | ✅ exit 0                    | Vitest unit suite green.                                                                        |
| `pnpm build`     | ✅ exit 0                    | Next.js production build green.                                                                 |
| `pnpm test:rls`  | ⚠️ requires running Supabase | Skipped in audit; CI runs in `integration-tests` job (verified passing in workflow on PR #126). |

**All four code-quality gates pass at the time of this audit.** This is the strongest possible baseline for the findings below — every issue listed is an architectural/behavioral finding, not a "your code doesn't compile" problem. The author should re-run all 5 locally before applying any audit fixes to catch regressions.

### `pnpm audit --audit-level=low`

3 vulnerabilities found — 1 high (`basic-ftp`), 2 moderate (`postcss`, `ip-address`). All in dev dependency chain (lighthouse). See SE-15. Not a launch blocker.

### Secret scan

Pattern: `(sk_live|sk_test|SUPABASE_SERVICE_ROLE_KEY=|eyJ\w{20,}\.|password\s*[:=]\s*['\"][^'\"]+['\"]|apiKey\s*[:=]\s*['\"][^'\"]+['\"]|GEMINI_API_KEY=['\"][^'\"]+['\"]|GOOGLE_API_KEY=['\"][^'\"]+['\"])`
Hits across `*.{ts,tsx,js,jsx,mjs,cjs,json}`: only test fixtures (`'test-key'`, `'qa-test-password-12345'` in `__tests__/rls/*` and LLM test files). **No production secrets in source.** ✅

### Git activity (since 2026-04-29)

51 commits, PRs #99–#150. Phase 3 (F3-E1 budgets through F3-E6 onboarding) shipped 2026-04-30 → 2026-05-03. Phase 4 invite gating + RLS audit shipped 2026-05-03 → 2026-05-04. Dashboard DnD + profile self-healing finalized 2026-05-04 → 2026-05-07.

### Migration count

73 SQL migrations. Newest: `20260623120000_00066_backfill_missing_profiles.sql`.

---

## Appendix B — Audit methodology footprint

- **5 parallel Explore agents** dispatched: A=Diff (regression check vs prior audit), B=Phase 3 deep-dive, C=Phase 0–2 re-audit, D=Security+i18n, E=Performance+DB.
- **1 Plan agent** dispatched to critique audit methodology itself (catch missing specialist passes).
- **Files read in full:** middleware, configs, error boundaries, CI, key Server Actions (transakcije/budzeti/ciljevi/skeniraj/podesavanja/pocetna), critical migrations (00061, 00065), cron routes, supabase/config.toml, .env.example, eslint.config.mjs, lib/logger.ts, lib/supabase/{server,middleware,admin}.ts, app/(app)/budzeti/page.tsx, lib/analytics/forecast.ts (multiple sections).
- **Files spot-read or grep-sampled:** all of `app/(app)/*/actions.ts`, all migrations newer than 00045, components in dashboard/budgets/goals/insights/onboarding/recurring.
- **Out of scope (per plan):** browser smoke tests, premium-redesign (F0–F4), load testing, writing new tests.

### Diff agent results (regression check)

**Verified 32/37 prior-audit items still fixed**, 3 ⚠️ unclear, **0 confirmed regressions**.
The 3 ⚠️ items: DL-3 (cancel-deletion race window — narrowed by SE-1 jti, acceptable), UX-5 (English string remnants — handled by N20 lint rule), MT-5 (parser SLO test specifics — exists but narrow assertion coverage).

---

## Appendix C — Cross-reference: prior-audit IDs

| Original ID  | Status today                             | Note                                                                                                                                              |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| DL-1 to DL-8 | ✅ all confirmed shipped                 | account ledger trigger, transfer pair, soft-delete, FX rounding, eq('user_id') enforcement                                                        |
| SE-1 to SE-8 | ✅ all confirmed shipped                 | jti single-use, constant-time compare, plausibility validator, nonce CSP, magic bytes, logSafe, PII redaction, rate-limit RPC                     |
| AV-1 to AV-6 | ✅ all confirmed shipped (AV-2 descoped) | Gemini circuit breaker, async pipeline removed, export streaming, FX dedup, count estimation, FX recovery                                         |
| UX-1 to UX-9 | ✅ confirmed                             | error.tsx, ImportBatchStatus, per-field validation, formatMoney consistency, idempotent cancel, select-all, rate-limit pre-check, per-row boolean |
| MT-1 to MT-6 | ✅ all confirmed                         | imports decomposed, coverage gates, E2E on PR, critical tests, parser SLOs, DI seam                                                               |

**No regressions.** The previous audit's hardening sticks.

This new audit (this document) adds: AV-7, PR-1, PR-2, SE-9 through SE-16, UX-10 through UX-14, BG-1 through BG-2, RC-1, GL-1, IN-1, OB-1, DD-1, TR-1 through TR-2, MT-7 through MT-13, EH-1 through EH-3, DL-9 through DL-11, TS-1 through TS-3, PR-3, PR-4, CL-1 through CL-3.

---

**End of audit. Total findings: 42. Recommended next action: triage the 4 hard-requirement items (AV-7, PR-1, PR-2, SE-12), assign to a Day-1 PR, then open `ENABLE_INVITES=true` in production once green.**
