# AV-2 — Async Parse Pipeline Production Cutover

**What this enables:** flips the import pipeline from synchronous (60s Vercel function cap, fragile for >200-row statements) to asynchronous (Inngest worker, no time cap, watchdog recovery). The async code has been deployed since PR #8 but is gated behind `IMPORTS_ASYNC=true` env flag.

**Why a runbook exists:** The first cutover attempt (2026-04-28) failed because four preconditions were missed: (a) migration `20260527130000_00040_import_batches_enqueued_status` was not applied to production Supabase, (b) the frontend's `narrowStatus()` did not include `'enqueued'`, so transitional state rendered as failed UI with `NULL error_message`, (c) the project is on Vercel **Hobby** plan with a hard 60s function cap that the `run-pipeline` step exceeds for real bank statements (the trap that ultimately killed the cutover), and (d) we toggled the flag before verifying any of the above. Production was usable but the async path was structurally unable to complete. This runbook prevents a repeat.

---

## Phase 0 — Pre-flight checks

Every box must be ✅ before any flag is flipped. If even one is unclear, **stop and resolve** before proceeding.

### 0.0 Watchdog must be re-introduced

**Watchdog je uklonjen 2026-05-02 zbog Inngest free-tier prekoračenja** — cron `* * * * *` trošio je ~86,400 executions/mes na praznom workload-u (sync-only put nema enqueued batch-eva). `watchdog-stuck-imports.ts` izbrisan je iz `lib/inngest/functions/`; `inngestFunctions` array sadrži samo `parseImportFn`.

**Pre flipovanja `IMPORTS_ASYNC=true`** moraš jedno od dva:

- **Vratiti watchdog**: `git show 24cabcc:lib/inngest/functions/watchdog-stuck-imports.ts > lib/inngest/functions/watchdog-stuck-imports.ts`, dodati nazad u `inngestFunctions` array, vratiti registration test (`toHaveLength(1)` → `toHaveLength(2)` plus watchdog test). **Razmotriti manje agresivan cron** (npr. `*/5 * * * *` ili `*/15 * * * *`) ili upgrade na Inngest Pro plan ($20/mes, 1M executions) — `* * * * *` na free-planu je strukturalno nemoguć.
- **Ili zameniti recovery mehanizmom koji ne pravi cron-spam**: npr. self-scheduled Inngest event (`step.sleep('11min')` posle parse-import event-a) koji se trigeruje samo kad postoji workload.

Sync-only put **ne zahteva watchdog** jer [recover-stuck-imports.ts](../../lib/server/actions/recover-stuck-imports.ts) radi user-load recovery (10-min threshold) pri svakoj poseti `/import` stranice.

- [ ] Watchdog vraćen ili zamenjen pre nego što se ide na 0.1+

### 0.1 Code state

- [ ] `main` includes commit `24cabcc` ("feat(AV-2): async parse pipeline via Inngest with watchdog") — verify: `git log --oneline origin/main | grep AV-2`
- [ ] `main` includes the `'enqueued'` status fix in `app/(app)/import/[batchId]/page.tsx` (`BatchStatus` union and `narrowStatus()` both list `'enqueued'`). **Without this, every async upload renders failed UI for ~3s while in `enqueued` state.** Verify by `grep "'enqueued'" app/\(app\)/import/\[batchId\]/page.tsx` — must return at least 2 hits.
- [ ] `app/(app)/import/import-batch-await-parse.tsx` props type accepts `'enqueued'` — same grep, ≥1 hit.

### 0.2 Database state (Supabase Production)

The local `supabase/migrations/` directory has the source of truth. Production Postgres must have all of them applied.

**Apply pending migrations:**

```bash
# From repo root, with your prod project ref
supabase link --project-ref <prod-project-ref>
supabase db push          # applies all migrations missing from prod
supabase db diff          # final sanity check; should report no schema diff
```

**Verify the AV-2 critical migration is in:**

```sql
-- In Supabase SQL Editor (Production)
select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'import_batches_status_check';
-- Expected output must include: 'enqueued'
```

If `'enqueued'` is missing from the constraint, **stop**: the route's `update({ status: 'enqueued' })` will fail with a check-constraint violation and the parse route returns 500.

**Verify all migrations are tracked:**

```sql
select count(*) from supabase_migrations.schema_migrations;
-- Compare to: ls supabase/migrations/*.sql | wc -l (should match)
```

### 0.3 Vercel environment variables (Production scope)

Check at https://vercel.com/jasnezs-projects/konto/settings/environment-variables. Filter to **Production** scope. Each variable below must exist:

- [ ] `INNGEST_EVENT_KEY` — used by `inngest.send()` from the parse route. **Must be a Production-environment Inngest key, not Test/Dev.** See 0.4.
- [ ] `INNGEST_SIGNING_KEY` — used by `serve()` to verify Inngest cloud signatures. **Must match the same Inngest environment as the event key.**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — `parseImportFn` uses `createAdminClient()` (no user session in worker context) which reads this.
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the route handler itself runs as the user.
- [ ] `GEMINI_API_KEY` — pipeline calls Gemini for structured parse.
- [ ] `MISTRAL_API_KEY` (optional) — only needed if the user uploads a scanned PDF (text extraction returns empty → OCR fallback). Pipeline tolerates absence.

**`IMPORTS_ASYNC` must NOT be present yet.** It is the last lever pulled, in Phase 2.

### 0.4 Inngest environment match

This is the trap that bit us last time. Inngest has separate **Production**, **Test**, and **Branch** environments. Each has its own event key + signing key. **Vercel's keys must match the same Inngest env where the production app is synced.**

1. Open https://app.inngest.com/env/production/manage/keys (note the URL says `/env/production/`)
2. Confirm the left sidebar selector shows **Production** (not Test/Branch)
3. Reveal the Event Key — it should be a 64-char hex string starting with a stable prefix
4. Compare with the value in Vercel's `INNGEST_EVENT_KEY` Production-scope variable

If they don't match, you're sending events to a different stream than where the function is registered. Symptom: parse route returns 202 (event sent OK), but no run ever appears in Inngest dashboard. **Fix** before proceeding.

### 0.5 Inngest app registration

1. https://app.inngest.com/env/production/apps/konto
2. Verify:
   - [ ] **App ID** = `konto`
   - [ ] **Last sync** is recent (post-latest-deploy) and status `Success`
   - [ ] **URL** is reachable. May be either:
     - Production alias: `https://konto-murex.vercel.app/api/inngest?x-vercel-protection-bypass=<token>` (preferred — stable across deploys)
     - Deployment-specific: `https://konto-<id>-jasnezs-projects.vercel.app/api/inngest?x-vercel-protection-bypass=<token>` (auto-syncs on each deploy; works but creates a re-sync on every deploy)
3. **Functions tab** must list:
   - [ ] **Parse import (async)** — listens to event `import/parse.requested`
   - [ ] **Watchdog: stuck imports** — cron (only if you've completed 0.0 and re-introduced it; otherwise expect this to be absent)
4. If watchdog re-introduced: it should have at least one **Completed** run within its cron interval. (No completed runs ⇒ Inngest can't reach the function URL ⇒ async path will silently fail too.) For sanity-checking reachability without watchdog, manually invoke `parse-import` via Inngest dashboard "Send event" → `import/parse.requested` with a real `batchId`/`userId` and confirm a Completed run appears.

### 0.6 Sync path is the rollback baseline

Before flipping anything, do one **clean sync-path import** end-to-end with a real PDF. This is the state we fall back to if anything goes wrong. If sync is broken, fix sync first — async cutover is not the time to debug pre-existing issues.

- [ ] Upload real PDF → status flows `uploaded → parsing → ready/awaiting_review → imported`
- [ ] Transactions visible in `/transakcije`

### 0.7 Vercel plan tier — the silent blocker

This is the trap that bit the 2026-04-28 cutover attempt and is **not optional**.

Inngest functions on Vercel run as **regular serverless functions** that Inngest cloud invokes — every `step.run()` is a fresh Vercel invocation bound by the project's plan-tier `maxDuration` cap:

| Plan       | Max `maxDuration`                     | Verdict for AV-2                                                                            |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hobby      | 60s                                   | **Will not work** for any statement large enough to need >60s of Gemini + extraction. STOP. |
| Pro        | 300s default, 800s with `vercel.json` | Works. Bump `maxDuration` in `app/api/inngest/route.ts` from 60 to 300 before flipping.     |
| Enterprise | 900s                                  | Works. Same code change as Pro.                                                             |

**Verify the plan:**

1. https://vercel.com/jasnezs-projects/settings/billing — top of page shows current plan
2. If **Hobby**: do not flip `IMPORTS_ASYNC=true`. Async path will fail with `FUNCTION_INVOCATION_TIMEOUT` for the exact statements AV-2 is meant to fix. Either upgrade to Pro **or** refactor `parseImportFn` so no single step exceeds 60s (e.g. chunk the LLM call by page across separate steps). Track this as a follow-up; do not attempt cutover until resolved.
3. If **Pro/Enterprise**: bump `maxDuration` in two files (PR before flipping):
   - `app/api/inngest/route.ts:export const maxDuration = 60` → `300`
   - `app/api/imports/[batchId]/parse/route.ts:export const maxDuration = 60` → `300` (sync fallback)

**Why this isn't obvious:** "Inngest functions have no time cap" is true at the orchestration layer (Inngest cloud will keep your run alive for hours, retrying steps), but every individual step still runs as a Vercel function with the plan-tier cap. The Inngest docs and the AV-2 audit recommendation both elide this, which is how the original cutover plan missed it.

- [ ] Plan tier identified
- [ ] If Hobby: cutover deferred until plan upgrade or pipeline refactor
- [ ] If Pro+: `maxDuration` bumped to 300 in both routes via PR; PR merged and deployed before proceeding to Phase 2

---

## Phase 1 — One last code-level audit

Open these three files and confirm by eye:

1. **`lib/inngest/client.ts`** — `new Inngest({ id: 'konto' })` and event name `'import/parse.requested'` exported. Nothing else.
2. **`app/api/imports/[batchId]/parse/route.ts:85-118`** — async branch:
   - Marks status `'enqueued'`
   - Calls `inngest.send({ name: 'import/parse.requested', data: { batchId, userId } })`
   - On send error: rolls back to `'uploaded'` and returns 500 (do not flip without verifying this catch is intact)
3. **`lib/inngest/functions/parse-import.ts`** — function id `'parse-import'`, retries `0`, concurrency by `userId` limit 2. Catch block writes `error_message` to DB before re-throwing.

If any of those three have drifted, **stop**.

---

## Phase 2 — Cutover

### 2.1 Set the flag

Vercel Dashboard → Settings → Environment Variables → **Add New**:

| Field       | Value                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| Key         | `IMPORTS_ASYNC`                                                                     |
| Value       | `true`                                                                              |
| Environment | **Production** ✅ (also Preview if you want preview deploys to test the async path) |

Save.

### 2.2 Force a fresh redeploy

Env-var changes do not auto-rebuild. Go to **Deployments**:

1. Find the latest **main** production deploy
2. ⋯ menu → **Redeploy**
3. **Uncheck** "Use existing Build Cache" (env var changes won't be picked up otherwise)
4. Confirm
5. Wait for status `Ready` (~2-3 min)

### 2.3 Verify the deploy is the right one

The freshly-deployed function will auto-sync to Inngest. Confirm:

1. https://app.inngest.com/env/production/apps/konto → **Last sync** timestamp is post-redeploy
2. Vercel runtime logs show no errors during the sync handshake (look for any GET/PUT/POST 200 to `/api/inngest` immediately after deploy)

---

## Phase 3 — Smoke test (with explicit success criteria)

**Setup:** Open three tabs side-by-side:

1. **Browser** — `https://konto-murex.vercel.app/import` (open DevTools, **Network** tab, **Preserve log**)
2. **Supabase** — Table Editor → `import_batches`, with the latest row visible
3. **Inngest** — https://app.inngest.com/env/production/apps/konto → Functions → **Parse import (async)** → Runs

### 3.1 The fresh upload

Upload a real bank PDF.

**Expected sequence (each gate must pass):**

| Step | Where              | Expected                                                                     | What it proves                                                |
| ---- | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | DevTools Network   | `POST /api/imports/<id>/parse` returns **202** with body `{"enqueued":true}` | Async path entered, `inngest.send()` succeeded                |
| 2    | Supabase row       | `status = 'enqueued'` (visible within ~1s, may flip fast)                    | Route reached the enqueued branch                             |
| 3    | Inngest dashboard  | New run appears in **Parse import (async)** within 5s                        | Inngest cloud delivered the event to the function             |
| 4    | Inngest run detail | Steps `load-batch` → `mark-parsing` → `run-pipeline` all green               | Worker has Supabase + Gemini credentials, pdfjs loads cleanly |
| 5    | Supabase row       | `status` flips through `parsing` → `ready` (or `awaiting_review`)            | Pipeline completed                                            |
| 6    | Browser UI         | Page polls and redirects to review screen (or transactions list)             | UI handles the async transitions correctly                    |
| 7    | `/transakcije`     | New transactions visible                                                     | End-to-end success                                            |

### 3.2 If a gate fails

**Gate 1 fails (POST returns 500):**

- Vercel runtime logs → filter `/api/imports` → look for `parse_route_enqueue_send_error` or `parse_route_enqueue_mark_error`
- `mark_error` with check-constraint violation → migration 0.2 not actually applied → re-do 0.2
- `send_error` with "Event key not found" or "Unauthorized" → 0.4 mismatch → fix and redeploy

**Gate 3 fails (POST 202 but no Inngest run within 30s):**

- Inngest dashboard → **Events** tab (left rail) → search by event name `import/parse.requested`
- Event present but no run → function URL unreachable. Re-sync from Inngest dashboard → "Resync" button.
- Event absent → 0.4 mismatch (events going to wrong env)

**Gate 4-5 fails (Inngest run errors):**

- Click the run → expand the failing step → read the error
- If `pdf_not_found` / `no_text_extracted` → existing pipeline issue, not AV-2 specific
- If `service_unavailable` → Gemini outage; circuit breaker opened (AV-1 working as designed)
- Anything else → capture the stack trace and roll back

**Gate 6 fails (UI shows "Uvoz nije uspio" while DB row is healthy):**

- This is the trap from the failed first cutover. Verify 0.1 — the `'enqueued'` fix must be in main.

---

## Phase 4 — Rollback (kill switch)

Whenever Phase 3 doesn't complete cleanly within 5 minutes, **roll back first, debug second.** Sync path was good before; we don't need async at any cost.

### 4.1 Steps (under 4 minutes total)

1. Vercel → Settings → Environment Variables → `IMPORTS_ASYNC` → **Remove** (or set to anything other than `true`; the route falls back to sync)
2. Deployments → latest → ⋯ → **Redeploy** → **uncheck** Use Build Cache
3. Wait for Ready (~2 min)
4. Hard-refresh browser → upload again → must succeed via sync path (60s budget)

### 4.2 Stuck batches after rollback

Any batch sitting in `enqueued` or `parsing` from the failed cutover gets cleaned up — flipped to `failed` with `error_message='parsing_timeout'` — either by the watchdog (within its cron interval, if 0.0 was completed and watchdog is re-introduced) or by `recoverStuckImports` (within ~10 min of the affected user opening `/import`). Users see "Uvoz nije uspio" with a retry option that uses the now-restored sync path. Manual cleanup not required.

---

## Phase 5 — Post-cutover hygiene (next 24h)

- [ ] Monitor Inngest dashboard hourly for unusual error rate in **Parse import (async)** runs
- [ ] Vercel runtime logs (filter `parse_import_async_error`) — should be near-zero
- [ ] Confirm at least 5 successful real-user imports through async path
- [ ] If clean: update audit doc to mark AV-2 production-active (the row in `docs/qa/pre-production-audit-2026-04-25.md` is already marked ✅ from PR #18 but may need a "production-active 2026-XX-XX" note)
- [ ] If the deploy-specific URL still annoys (auto-resync on every deploy), set the production-alias URL in Inngest manually using the bypass token. Steps: Inngest → app settings → "Set sync URL" → `https://konto-murex.vercel.app/api/inngest?x-vercel-protection-bypass=<vercel-automation-bypass-token>`. The token comes from Vercel → Settings → Deployment Protection → "Generate bypass for automation".

---

## Appendix A — Where to find the production-alias bypass token

Vercel deployment protection blocks deploy-specific URLs from external services unless you generate a bypass token. The token is project-wide (works for any deployment of the project including the alias).

Vercel Dashboard → konto project → Settings → **Deployment Protection** → "Protection Bypass for Automation" → **Generate**. Save the token; it's used as a query parameter `?x-vercel-protection-bypass=<token>` on the URL given to Inngest.

Note: Inngest already does this correctly when it auto-syncs — the deploy-specific URL in the dashboard contains this token. The only reason to set it manually is to use the production alias URL instead, which doesn't change every deploy.

## Appendix B — Failure-mode quick reference

| Symptom                                                                                         | Most likely cause                                                                                                                                                                                      | Fix                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST returns 500, log shows `parse_route_enqueue_mark_error` with check-constraint violation    | Migration 00040 not applied                                                                                                                                                                            | `supabase db push`                                                                                                                                                                                                        |
| POST returns 500, log shows `parse_route_enqueue_send_error` with "Event key not found"         | `INNGEST_EVENT_KEY` missing in Production scope                                                                                                                                                        | Add it, redeploy                                                                                                                                                                                                          |
| POST returns 500, log shows `parse_route_enqueue_send_error` with "Unauthorized"                | Event key from wrong Inngest env (Test vs Prod)                                                                                                                                                        | Replace with Production key, redeploy                                                                                                                                                                                     |
| POST returns 202 but no Inngest run                                                             | Function URL unreachable from Inngest cloud                                                                                                                                                            | Re-sync from dashboard; if still broken, check Vercel deployment protection                                                                                                                                               |
| UI shows "Uvoz nije uspio" but DB row is `enqueued`/`parsing`                                   | Frontend missing `'enqueued'` in `narrowStatus()`                                                                                                                                                      | Merge the fix; redeploy                                                                                                                                                                                                   |
| Inngest run completes, status stays `parsing` indefinitely                                      | Inngest function returned but did not update status (bug); watchdog (if re-introduced per 0.0) recovers within its cron interval, otherwise `recoverStuckImports` recovers on next `/import` page load | Inspect run, file bug                                                                                                                                                                                                     |
| All Inngest runs fail with "Cannot find module pdf.worker.mjs"                                  | `outputFileTracingIncludes` regression                                                                                                                                                                 | Check `next.config.ts`; verify `node-linker=hoisted` in `.npmrc`                                                                                                                                                          |
| Inngest run fails with `FUNCTION_INVOCATION_TIMEOUT`; batch ends `failed` / `parsing_timeout`   | Vercel plan-tier `maxDuration` exceeded (60s on Hobby; 300s default Pro)                                                                                                                               | See Phase 0.7. On Hobby: cutover not viable until plan upgrade or refactor.                                                                                                                                               |
| Inngest run errors `[GoogleGenerativeAI Error]: Request aborted ... This operation was aborted` | `GEMINI_TIMEOUT_MS` fired before Gemini answered                                                                                                                                                       | Bump `GEMINI_TIMEOUT_MS` and the recovery `STUCK_THRESHOLD_SECONDS` together (in `lib/server/actions/recover-stuck-imports.ts` and in any re-introduced watchdog — they must stay ≥2× the worst-case Gemini retry budget) |
