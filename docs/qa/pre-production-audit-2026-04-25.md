# Konto — Pre-Production Audit Report

**Date:** 2026-04-25 · **Auditor:** Principal Engineer / QA Director / Security Engineer / Product Strategist  
**Scope:** Full pre-production hardening audit — all 12 phases  
**Verdict:** Do not ship to real users without Week-1 hardening set complete

---

## Phase 1 — System Reconstruction

### Core Value Proposition

Konto is a privacy-first personal finance manager for the Western Balkans that eliminates manual data entry by parsing PDF bank statements from local institutions (Raiffeisen, UniCredit, ASA, NLB, Intesa) using Gemini 2.5 Flash-Lite, then auto-categorising transactions against a BiH-specific merchant dictionary. Users retain full ownership of their data — no bank API connection is ever required.

### User Flows

| Flow                      | Entry Point             | Server Action(s) / Route                                         | DB Writes                                                | External API Calls     | Terminal State                      |
| ------------------------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- | ---------------------- | ----------------------------------- |
| Magic-link auth           | `/prijava`              | `app/(auth)/shared/actions.ts` → `signInWithOtp`                 | `auth.users`, `profiles` (trigger)                       | Supabase Auth (Resend) | Authenticated session               |
| Manual transaction        | `/transakcije`          | `transakcije/actions.ts: createTransaction`                      | `transactions`                                           | Frankfurter/ECB (FX)   | Transaction in list                 |
| Transfer between accounts | `/transakcije`          | `create_transfer_pair` RPC                                       | Two `transactions`, `accounts.balance` ×2                | FX if cross-currency   | Paired rows, `is_transfer=true`     |
| Account CRUD              | `/racuni`               | `racuni/actions.ts`                                              | `accounts`                                               | None                   | Account active/deleted              |
| Category management       | `/kategorije`           | `kategorije/actions.ts`                                          | `categories`                                             | None                   | Category tree updated               |
| Merchant management       | `/merchants`            | `merchants/actions.ts`                                           | `merchants`, `merchant_aliases`                          | None                   | Dictionary updated                  |
| PDF statement import      | `/import`               | `imports.ts: uploadStatement` → `POST /parse` → `finalizeImport` | `import_batches`, `parsed_transactions` → `transactions` | Storage, Gemini, FX    | Batch `imported`, staging purged    |
| Receipt scan              | `/skeniraj`             | `skeniraj/actions.ts`                                            | `receipt_scans`, `transactions`                          | Storage, Gemini        | Transaction pre-filled              |
| Installment plan          | `/kartice-rate`         | `kartice-rate/actions.ts`                                        | `installment_plans`, `occurrences`                       | FX                     | Occurrences scheduled               |
| Data export               | `/podesavanja`          | `GET /api/export/data`                                           | `audit_log`                                              | None                   | JSON download                       |
| Account deletion          | `/podesavanja/obrisi`   | `requestAccountDeletion`                                         | `audit_log`                                              | Resend (cancel email)  | 30-day grace; hard-delete on expiry |
| Cancel deletion           | `/auth/otkazi-brisanje` | `runCancelDeletion`                                              | Clears `deleted_at`                                      | None                   | Deletion cancelled                  |

### Data Model (abridged)

```
profiles ── auth.users (1:1)                               RLS: own row
accounts [user_id FK]          current_balance_cents       RLS: yes
categories [user_id FK, parent_id self-ref]                RLS: yes
merchants [user_id FK]         transaction_count trigger   RLS: yes
merchant_aliases [user_id FK, merchant_id FK]              RLS: yes
transactions [user_id, account_id, merchant_id, category_id,
              import_batch_id, split_parent_id, transfer_pair_id,
              receipt_scan_id]                             RLS: yes
import_batches [user_id, account_id]
  status: uploaded→parsing→ready→imported|failed           RLS: yes
parsed_transactions [batch_id, user_id]  (staging)         RLS: yes
receipt_scans [user_id, transaction_id]                    RLS: yes
installment_plans / installment_occurrences                RLS: yes
categorization_rules [user_id]                             RLS: yes
user_corrections [user_id]     (append-only)               RLS: yes
fx_rates [date, base, quote]   (public read, service write) RLS: yes
rate_limits [user_id]          (sliding window)            RLS: yes
audit_log [user_id SET NULL on delete]                     RLS: yes
```

### Divergences from `docs/01-architecture.md`

| #   | Doc claim                                                     | Actual code                                                                  |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | PDF parsing is "Faza 2", feature-flagged                      | Fully shipped: `lib/server/actions/imports.ts`, full parse pipeline          |
| 2   | LLM categorization "Faza 2+"                                  | Wired; deferred only for `amountMinor < 5000`, not disabled globally         |
| 3   | `import_batches` schema matches §5.2                          | Stripped schema in migration `00025`; stats columns added incrementally      |
| 4   | Mistral OCR is "planned"                                      | `lib/parser/ocr-fallback.ts` already built and tested                        |
| 5   | Rate limiting deferred to Faza 3+ (Upstash Redis)             | DB-backed sliding-window live: `rate_limits` + `check_rate_limit_and_record` |
| 6   | `budgets`, `goals`, `recurring_transactions` not yet in scope | Tables exist in initial schema; no app code wired yet                        |
| 7   | Status enum: `pending/review/completed/cancelled`             | Code uses `uploaded/parsing/ready/imported/failed` — enum drift              |
| 8   | Transfer detection is manual checkbox (Faza 2+)               | `create_transfer_pair` RPC (migration `00021`) already shipped               |

### Risky Ambiguities

1. **`import_batches.status` enum mismatch** — code vs. docs use different values; status-badge rendering may be silently wrong depending on which document the UI reads.
2. **Balance trigger correctness on soft-delete** — `update_account_balance` fires on `UPDATE` (not `DELETE`) for soft-deletes; the trigger body is a no-op anyway, but intent is unclear and any implementation must handle both paths correctly.
3. **`parsed_transactions` never cleaned on reject** — `rejectImport` marks batch `failed` but does not `DELETE` staging rows; orphaned rows accumulate indefinitely.
4. **FX rate passed as `double precision` through RPC boundary** — `finalize_import_batch` and `create_transfer_pair` accept `fx_rate double precision` while `transactions.fx_rate` is `numeric(20,10)`; the implicit cast is lossy.
5. **One-legged transfer pairs** — no DB constraint ensures both legs of a transfer are created atomically; a crash mid-RPC can leave a phantom income or expense.

---

## Phase 2 — Real-World Failure Simulation

### Failure Matrix

| Flow             | Invalid input        | Network drop                     | Supabase down      | Gemini timeout     | FX API down                                    | Double-submit               | Concurrent edit         |
| ---------------- | -------------------- | -------------------------------- | ------------------ | ------------------ | ---------------------------------------------- | --------------------------- | ----------------------- |
| auth (OTP)       | ✅                   | ✅ `EMAIL_SEND_FAILED`           | ✅ surfaced        | N/A                | N/A                                            | ⚠️ no UI lock               | ✅ stateless            |
| new-transaction  | ✅ Zod               | ❌ no rollback                   | ❌ unhandled throw | N/A                | N/A                                            | ❌ no idempotency key       | ❌ last-write-wins      |
| new-account      | ✅ Zod               | ❌ no rollback                   | ❌ unhandled throw | N/A                | N/A                                            | ❌ no idempotency key       | ❌ last-write-wins      |
| import-upload    | ✅ MIME/size         | ❌ upload orphan in Storage      | ⚠️ partial         | N/A                | N/A                                            | ⚠️ duplicate batch possible | N/A                     |
| import-parse     | ✅ 409 guard         | ❌ batch stuck `parsing`         | ❌ stuck `parsing` | ❌ stuck `parsing` | N/A                                            | ✅ 409                      | ❌ two requests race    |
| import-finalize  | ✅ `BAD_STATE` guard | ❌ partial FX, stuck `importing` | ❌ same            | ❌ same            | ❌ `EXTERNAL_SERVICE_ERROR`, batch never reset | ❌ no idempotency           | ❌ race on status check |
| export           | ✅                   | ❌ stream aborted                | ❌ query throws    | N/A                | N/A                                            | ⚠️ re-download possible     | N/A                     |
| account-deletion | ✅ `ALREADY_PENDING` | ⚠️ rollback attempted            | ❌ silent fail     | N/A                | N/A                                            | ✅ `ALREADY_PENDING`        | ⚠️ cron+cancel race     |

### Deep Dive: `finalizeImport` (lib/server/actions/imports.ts:699–742)

FX conversion is called in a sequential `for` loop. If row 47 of 80 throws, the `catch` at line 709 returns `{ success: false, error: 'EXTERNAL_SERVICE_ERROR' }` immediately. The `prepared` array (rows 0–46) is discarded. The database is clean — the atomic `finalize_import_batch` RPC was never called — but the **batch status is left at `importing` permanently**. There is no status reset in the catch path. There is no `retryFinalize` action (only `retryImportParse` exists). The user sees a stale "importing" badge with no recovery path except manual DB intervention.

`convertToBase` does fall back to the latest stale rate from `fx_rates` on external API failure (`convert.ts:182–191`); it only throws if no stale rate exists at all for that currency. Pure FX outages only kill new/exotic currencies.

### Deep Dive: Account Deletion

**(a) Cancel link after 30 days** — Token expires after 24h (`JWT exp = now + 86400s`). After 30 days the Auth user is hard-deleted. `runCancelDeletion` calls `admin.auth.getUserById` which returns `USER_NOT_FOUND`. The route silently fails — no friendly page. ❌

**(b) Cron vs. cancel race** — `runCancelDeletion` reads `profile.deleted_at` at line 41, then writes `deleted_at: null` at line 46. If the cron reads between those two points, it queues the user for hard delete. The cancel update then commits to an orphaned profile. No `SELECT FOR UPDATE` or transaction protects this window. ❌

**(c) Magic-link after `deleted_at` set** — Middleware at `middleware.ts:59` checks `deleted_at` on every authenticated request; redirects to `/obrisan`. ✅

**(d) Sign in during grace period** — Same middleware check; `/auth/otkazi-brisanje` is in `allowedWhenDeleted`. ✅ (confusing but functional)

### Deep Dive: `retryImportParse`

Lines 971–975 delete all `parsed_transactions` for the batch before resetting to `uploaded` — stale rows correctly cleaned. Rate-limit slot consumed when the client calls the parse route again (not inside the action itself), with no UI counter warning the user. ⚠️

### PII Redaction Coverage

**Covered:** BiH/HR/SI/RS/ME/MK IBANs, Luhn-valid PANs (last 4 preserved), 13-digit JMBGs.  
**Not covered:** names, phone numbers, email addresses, street addresses, non-BiH IBANs (DE, AT, CH, etc.), tax numbers (PIB, OIB), partial PANs failing Luhn.  
**Tests:** 6 test cases covering only implemented patterns — gives false completeness; no adversarial or negative cases.

---

## Phase 3 — Deep Architecture Stress Test

### Coupling Map (Top 5 Modules)

| Module                                | LoC            | Inbound imports | Replaceability (1–5)                                                                |
| ------------------------------------- | -------------- | --------------- | ----------------------------------------------------------------------------------- |
| `lib/server/actions/imports.ts`       | 1005           | 5               | **5** — owns auth, validation, FX, dedup, RPC orchestration, storage; rewrite-grade |
| `lib/fx/convert.ts`                   | 308            | 7               | **3** — clean interface but service-role + dual-leg EUR pivot                       |
| `lib/categorization/cascade.ts` + SQL | 182 + ~200 SQL | 6               | **4** — TS replaceable, but SQL bundles 4 strategies in one round-trip              |
| `lib/dedup.ts`                        | small          | 7               | **2** — pure function, but hash is persisted; algorithm change requires backfill    |
| `app/(app)/transakcije/page.tsx`      | 292            | route entry     | **2** — straightforward, `range()` pagination                                       |

### Single Points of Failure

| Component                            | Blast radius                    | Fallback                                | Circuit breaker | Mitigation                                         |
| ------------------------------------ | ------------------------------- | --------------------------------------- | --------------- | -------------------------------------------------- |
| **Gemini API**                       | ~30% — entire import flow       | None                                    | No              | Retry + opossum breaker; secondary parser fallback |
| **ECB/Frankfurter FX**               | ~5% non-BAM/EUR imports         | Stale rate from `fx_rates` (implicit)   | Implicit        | Pre-warm daily; expose stale flag in UI            |
| **Supabase Storage**                 | ~30% — upload + parse           | None                                    | No              | Health check; retry queue                          |
| **pg_cron cleanup**                  | 0% functional, compliance grows | `remove()` in finalize/reject (partial) | No              | Alert on bucket size; idempotent reaper API        |
| **`dedup_hash` algorithm**           | ~10% — silent duplicates        | None (single algorithm)                 | No              | Add `dedup_hash_version` column                    |
| **`run_categorization_cascade` RPC** | ~20% — per-row in parse loop    | Graceful `none` on error                | No              | Batch; surface RPC errors distinctly               |

### Scaling Thresholds

- **`/transakcije` page:** Hard-paginated at `PAGE_SIZE = 50` — rendering stays safe. However, `count: 'exact'` on every load exceeds **300ms at ~100k transactions** and crosses the 3s mark at ~500k.
- **`GET /api/export/data`:** No streaming; `JSON.stringify` doubles peak RSS. OOM at ~1M rows, but **Vercel 60s timeout** is hit first at ~100k transactions with full join overhead.
- **Trigram cascade RPC:** Bounded per user. At ~50k aliases/user: >100ms; ~200k: >300ms. Unrealistic for single users; safe.
- **Parse route with 200-page PDF:** PDF extraction ~15s + Gemini ~45–90s + 500-row cascade loop ~12s = **>60s guaranteed timeout**. Batch stranded in `parsing` with no UI recovery.

### Abstraction Wall

No client components importing server modules, no stores importing server code, no direct DB calls from UI. One soft violation: `finalizeImport` calls `revalidatePath('/transakcije')` — server action with knowledge of UI routes (acceptable in Next.js but creates coupling).

The per-row categorization RPC loop (`parse/route.ts:140–162`) is a layering smell: `cascade.ts` exposes a single-row API while the call site has N rows. The 60s budget is silently consumed by this N round-trip pattern.

### Most Likely First Failure

**The parse route on a real-world 200+ row bank statement.** It is the only surface combining four independent latency sources (Storage download, PDF extraction + OCR fallback, Gemini LLM, N cascade RPCs) inside a single 60s lambda budget. Any Raiffeisen BiH statement from an active account easily has 300+ rows. The batch gets stuck in `parsing`, the user's 10/24h import quota is spent, and the PDF sits in Storage — unrecoverable from the UI. At scale, this becomes the dominant support ticket.

---

## Phase 4 — Code Quality & Tech Debt Exposure

### Mechanical Scan

| Category                          | Count | Locations                                                                |
| --------------------------------- | ----- | ------------------------------------------------------------------------ |
| `: any`                           | 2     | `components/accounts/account-form.tsx:277,278` — form/onSubmit untyped   |
| `@ts-ignore` / `@ts-expect-error` | 0     | Clean                                                                    |
| `// eslint-disable`               | 0     | Clean                                                                    |
| TODO/FIXME/XXX/HACK               | 1     | `supabase/migrations/…00001…sql:127` — no-op balance trigger placeholder |
| "for now" / "temporary"           | 0     | Clean                                                                    |
| Commented-out code (>3 lines)     | 0     | Clean                                                                    |

### Hotspot Analysis — `lib/server/actions/imports.ts`

- **Cyclomatic complexity:** ~45 branches across 7 exported functions; `finalizeImport` alone has ~16.
- **5 distinct concerns:** file upload + dedup, staged-row mutation + learning loop, state machine transitions, FX conversion + dedup-hash prep, atomic RPC orchestration + storage cleanup.
- **Testability:** Low. Every function opens its own `createClient()` + `auth.getUser()` inline with no injection point. `finalizeImport` calls `convertToBase` (network) and two RPCs with no seam for mocking.
- **Most dangerous 50 lines:** `finalizeImport:699–766` — sequential FX loop with abort-on-any-failure, no batch status reset in catch, and `parseDedupSkipIndices` consuming unvalidated Postgres output.

### Duplicated Logic

- **`eq('user_id', user.id)` — 100+ occurrences across 20+ files.** A `withOwnedQuery()` wrapper would make omission a compile error, not a runtime data leak.
- **Error shape:** Mostly uniform `{ success, error, data? }` but `togglePartialExclusion` and `bulkApplyCategoryToParsedRows` return `{ success, updated: number }` (no `data` wrapper) while `uploadStatement` returns `{ success, data: { batchId } }`. Consumers need per-action type narrowing.
- **Zod boilerplate:** 50+ identical `.safeParse()` + `buildValidationDetails()` patterns across action files; `buildValidationDetails` is defined in `imports.ts` but not exported or shared.
- **FX rounding outside `lib/fx/`:**
  - `lib/queries/summary.ts:97–100` — hardcoded BAM/EUR rate with `Math.round(Number(cents) / BAM_EUR_RATE)`
  - `app/(app)/skeniraj/receipt-scan-client.tsx:48` — `BigInt(Math.round(Math.abs(amount) * 100))` inline float-to-cents on the client

### Migration Debt

- ~~**`00001_initial_schema.sql:127`** — `update_account_balance` trigger body is a passthrough no-op.~~ **CORRECTED 2026-04-26:** The placeholder was superseded by `00013_account_balance_trigger.sql` (full re-sum implementation), `00035_account_balance_multi_currency.sql` (cross-currency fix), and `00036_account_ledger_cents.sql` (dedicated ledger column as single source of truth). All three include idempotent backfills. The audit reviewed the initial schema in isolation and missed the superseding migrations. See revised DL-1 row in §10.
- **`00034_audit_log_fk_set_null_on_user_delete.sql`** — The `audit_log_prevent_mutation` trigger carve-out permits any `UPDATE` that sets `user_id = NULL` while leaving all other columns unchanged. A buggy migration or hostile DB access can erase audit trail links for an entire user's history.

### Top 3 Refactor Recommendations

1. **Extract `withOwnedQuery()` helper** — structural ownership guarantee replaces 100+ manual checks. M complexity, medium regression risk (must audit all mutation callsites).
2. ~~**Implement `update_account_balance` trigger**~~ — already done; see DL-1 correction note above.
3. **Decompose `finalizeImport` into injectable pipeline** — extract `prepareFxRows(staging, currency, converter)` accepting injected converter; `Promise.all` over distinct (currency, date) pairs; fallback to stale rate per row instead of aborting entire batch. M complexity.

---

## Phase 5 — Adversarial Security Review

### 🔴 Critical

**SE-1 — Account-deletion cancel token: no replay protection**  
`lib/account-deletion/cancel-token.ts:55` uses `timingSafeEqual` (correct) and enforces 24h expiry. But there is **no `jti` (JWT ID) or used-token store**. The same valid token can be replayed unlimited times within 24h. On each replay, `runCancelDeletion` (`run-cancel-deletion.ts:59–63`) generates a fresh Supabase magic-link. **Exploit:** mailbox compromise → attacker captures cancel email → replays token → un-cancels deletion silently + mints a new magic-link for account takeover.  
**Fix:** Add `jti` (UUID) to payload; persist `jti + consumed_at` in `deletion_cancel_tokens` table; reject replays.

### 🟠 High

**SE-3 — Gemini prompt injection via crafted PDF**  
`lib/parser/llm-parse.ts:123–125` concatenates `bankHint` and `redactedText` directly into the user message. `responseSchema` and `temperature: 0` enforce JSON structure but **not provenance**. Crafted PDF text can inject fake transaction rows that pass `ParseResultSchema.parse` (line 133) — no date-range guard, no amount plausibility cap, no description sanitization. Injected rows reach the user's review UI looking legitimate and can contain phishing copy (500-char `description` field).  
**Fix:** Post-parse validator: dates must fall within statement period ±7 days; `|amountMinor|` < 10^11; strip control chars and known injection markers from descriptions; warn on suspicious patterns.

**SE-4 — No security headers**  
`next.config.ts` has no `headers()` block. No CSP, X-Frame-Options, HSTS, Referrer-Policy, or Permissions-Policy. Recommended minimal set:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<runtime>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co
    https://generativelanguage.googleapis.com; frame-ancestors 'none';
```

Ship CSP in `report-only` mode for 48h before enforcing.

**SE-6 — PII leaks into Vercel logs**  
82 `console.error` calls across the codebase. `verify_otp_error` (`shared/actions.ts:81`) can log Supabase rate-limit error messages containing the user's email. `parse_route_error` (`parse/route.ts:205`) logs `error.message` which may include raw statement text if extraction throws. **GDPR breach on every parse failure.**  
**Fix:** Centralized `logSafe(event, fields)` via `pino` with redact paths; ESLint `no-console` rule banning raw `console.*` in production source.

**SE-7 — PII redaction incomplete**  
`lib/parser/redact-pii.ts` covers only BiH/regional IBANs, Luhn-valid PANs, and 13-digit JMBGs. Names, phone numbers, email addresses, German/Austrian IBANs, tax numbers, and partial PANs failing Luhn flow through unredacted to Gemini.  
**Fix:** Add `libphonenumber-js`, RFC 5322 email regex, ISO 13616 IBAN regex; expand test suite with adversarial cases.

**AV-1 — Gemini no fallback, no retry, no circuit breaker**  
`parseStatementWithLLM` (`lib/parser/llm-parse.ts`) is a single direct call. One transient Gemini error returns `failed` batch with quota consumed and PDF stranded.  
**Fix:** Retry with exponential backoff (3× on 5xx/timeout); opossum circuit breaker; route `CIRCUIT_OPEN` state to a user-visible "import temporarily unavailable" banner.

### 🟡 Medium

**SE-2 — Non-constant-time cron bearer compare** (`hard-delete-accounts/index.ts:32` — string `===`): use `crypto.timingSafeEqual`.

**SE-5 — PDF MIME by claim only:** `file.type === 'application/pdf'` trusts browser input; `%PDF-` magic-byte check takes 5 lines and eliminates the class entirely.

**SE-8 — Unnecessary `rate_limits` INSERT policy:** users can inflate their own counter directly via client; drop the direct INSERT policy (RPC already enforces correctly).

### 🟢 Low / Confirmed Safe

IDOR: all 8 sampled actions check `user_id` explicitly, defense-in-depth confirmed.  
Open redirect: `sanitizeNextPath` (`lib/auth/safe-next.ts:27–37`) rejects external schemes, `//host`, `\host`.  
Storage path: `${user.id}/${randomUUID()}.pdf` — not user-controllable.  
Token expiry: 24h enforced. Timing-safe compare in cancel token: ✅.  
RLS: all user-owned tables enabled, no gaps found.

---

## Phase 6 — Performance Breakpoint Analysis

### DB Query Inventory (critical paths)

| Location                       | Table                  | Paginated                   | Indexed filter cols | N+1 risk                    |
| ------------------------------ | ---------------------- | --------------------------- | ------------------- | --------------------------- |
| `transakcije/page.tsx` — count | `transactions`         | No (`count:exact` over all) | `idx_tx_user_date`  | No                          |
| `transakcije/page.tsx` — data  | `transactions`         | ✅ `.range(0,49)`           | `idx_tx_user_date`  | Merchant fetch is 2nd query |
| `finalizeImport` FX loop       | `fx_rates`             | No (1 row per call)         | `idx_fx_quote_date` | **Yes** — N calls in loop   |
| `build-user-export-json`       | `transactions` + joins | **None — unbounded**        | `idx_tx_user_date`  | No but full-table           |
| `run_categorization_cascade`   | `merchant_aliases`     | Internal (GIN)              | GIN trigram ✅      | N calls per import row      |

### Missing Indexes

- `transactions.description` and `.notes` have no trigram index — text search falls back to sequential scan with `ILIKE`.
- `transactions.import_batch_id` index exists but is non-partial (includes deleted rows).
- `dedup_hash`: index exists (`idx_tx_dedup (user_id, dedup_hash)`, partial on `deleted_at IS NULL`). ✅

### Frontend Re-render Hotspots

In `import-review-client.tsx`: rows rendered with `rows.map(...)` — **no virtualization** for 100-row imports. `ReviewDesktopRow` and `ReviewMobileCard` are wrapped in `memo` correctly for cell edits. However, `bulkIds` is a `Set` replaced with `new Set(prev)` on every checkbox toggle — this invalidates `memo` for all 100 rows simultaneously on any bulk action.

### Export OOM

`build-user-export-json.ts` loads all rows + joins into memory, then `JSON.stringify`s the whole object before returning. At ~650 bytes/transaction (with joined fields), the Vercel 60s timeout is reached at ~100k transactions. The 1 GB memory ceiling is hit at ~1M rows (not the practical limit). Streaming via `ReadableStream` + cursor pagination is the fix.

### External API Timing

Worst-case 100-row multi-currency statement: 100 × 300ms FX calls (no in-process cache, no `Promise.all`) = **30s FX alone**, plus Gemini + cascade. Fits within 60s barely; 200 rows does not.

`lib/fx/convert.ts` does check the DB cache (`fx_rates`) per call, preventing external HTTP on cache hit. But two rows with the same (currency, date) still each issue a `SELECT` to `fx_rates`. A single JS-level `Map` keyed on `${currency}_${date}` inside `finalizeImport` would eliminate redundant DB round-trips with zero risk.

### Bundle Analysis

No `next/dynamic`, `React.lazy`, or dynamic `import()` anywhere. Both `pdfjs-dist` and `@google/generative-ai` are server-only (no `'use client'` in their import chains) so they don't reach the client bundle today. Without `server-only` guards on those parser files, a future accidental import from a client component would silently pull ~8 MB into the bundle.

### Worst Single Query

**`buildUserExportJsonForRequest` — unbounded `transactions SELECT *` with category + merchant join, no LIMIT.** This was the query most likely to produce a 504 for any user with more than a few years of imported statements. **Resolved 2026-04-28 (AV-3)**: `GET /api/export/data` now streams via keyset cursor; legacy in-memory function retained for the `exportAllData` server-action fallback path only.

---

## Phase 7 — UX Friction & Product Gaps

### Form Errors Inventory

| Form                            | Field-level errors?                | Language                                          | Edge cases handled?                                           |
| ------------------------------- | ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| New transaction (QuickAdd)      | ✅ RHF + `FormMessage`             | Bosnian labels/toasts; **"Retry" button English** | 0 amount allowed client-side; future date allowed             |
| New account                     | ✅ server errors mapped to fields  | Bosnian                                           | Negative balance unexplained for credit accounts              |
| Import upload                   | N/A (file picker)                  | Bosnian                                           | Server-side rejection not surfaced to user with clear message |
| Edit transaction                | ⚠️ all Zod errors → one root toast | Bosnian; **"Merchant" label English**             | Future date and 0 amount not blocked                          |
| Category assign (import review) | No form; toast on failure          | Bosnian                                           | No required-category enforcement before finalize              |

### Loading / Empty / Error State Coverage

| Page             | Loading skeleton | Empty state                                        | Error state                                                                 |
| ---------------- | ---------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `/transakcije`   | ✅               | ✅ distinguishes "no filters" vs "no transactions" | ⚠️ DB error silently shows empty list                                       |
| `/racuni`        | ❌               | ✅ dashed card CTA                                 | ✅ explicit error paragraph                                                 |
| `/racuni/novi`   | ❌               | N/A                                                | ⚠️ `OPENING_BALANCE_CATEGORY_MISSING` → "contact support" (no path forward) |
| `/import` review | ❌               | ⚠️ no state if all rows excluded                   | ⚠️ finalize errors shown as toasts; page stays on review                    |
| `/podesavanja`   | ❌               | N/A                                                | ❌ no `error.tsx` anywhere under `app/(app)/`                               |
| `/pocetna`       | ✅               | ✅                                                 | ⚠️ same silent-empty risk as transactions                                   |

**Systemic gap:** No `error.tsx` exists anywhere under `app/(app)/`. Any server component throw renders the bare Next.js error page in English with no recovery action. This is the single most visible trust-breaking scenario for a first-time user.

### Money Display Consistency

`formatMoney()` bypassed in 4 places:

| File                                             | Line | Issue                                                         |
| ------------------------------------------------ | ---- | ------------------------------------------------------------- |
| `app/(app)/import/import-review-client.tsx`      | 121  | `minor / 100` + `toLocaleString` — not `formatMoney`          |
| `components/quick-add-transaction.tsx`           | 508  | `Number(cents) / 100` + inline `Intl.NumberFormat`            |
| `app/(app)/kartice-rate/kartice-rate-client.tsx` | 40   | Local shadow `formatMoney` — prints "KM 10,00" not "10,00 KM" |
| `app/(app)/skeniraj/receipt-scan-client.tsx`     | 507  | `item.total.toFixed(2)` — raw float, no currency label        |

### Import Review UX Gaps

- **(a) Low-confidence indicator:** ✅ Amber left-border on low-confidence rows; `categorization_source` badge per row.
- **(b) Bulk category:** ✅ Exists, but **no "select all" checkbox** — 80 rows must be ticked manually.
- **(c) Finalize gating:** ⚠️ Disabled when `importSelectedCount === 0` but **no enforcement that rows have a category**; user can finalize 80 uncategorized rows without warning.
- **(d) Mid-review browser close:** ✅ Every edit fires debounced `updateParsedTransaction` immediately; progress persists.
- **(e) Re-upload escape hatch:** ✅ "Odustani" calls `rejectImport` and navigates to `/import`.

### Account Deletion Trust

The 30-day grace period is shown before confirmation. However, the cancel link is described as "važi 24 sata" in the same card without linking this to the 30-day window — confusing. The cancel link is **not idempotent**: a second click after successful cancel returns `NOT_SCHEDULED` error instead of "already cancelled." No mention of whether data is truly purged vs. soft-deleted indefinitely.

### Accessibility Gaps

- `MoneyInput` callers that use `<FormLabel>` without passing the `id` prop — `<label>` is not `for`-linked to the input; screen readers cannot announce the label on focus.
- Import review mobile bulk checkbox `aria-label="Grupa"` is too brief to be meaningful.
- Focus management in modals is handled by Radix UI; no manual gaps found.

### English Strings in Bosnian UI

| File                                                         | Line | String                                             |
| ------------------------------------------------------------ | ---- | -------------------------------------------------- |
| `components/quick-add-transaction.tsx`                       | 248  | `label: 'Retry'` — toast action after save failure |
| `app/(app)/transakcije/[id]/uredi/transaction-edit-form.tsx` | 170  | `<FormLabel>Merchant</FormLabel>`                  |
| `app/(app)/import/import-review-client.tsx`                  | 1019 | `placeholder="Novi merchant — dodaj"` (mixed)      |

The "Retry" button is the highest-severity: it is the only English word a user sees after a failure, signalling a technical glitch rather than an app action.

---

## Phase 8 — Test Coverage Gap Analysis

### Coverage Matrix

| Flow / Module                             | Unit                      | RLS-Integration                                     | E2E                                  |
| ----------------------------------------- | ------------------------- | --------------------------------------------------- | ------------------------------------ |
| Auth flow                                 | ✅                        | ❌                                                  | ✅ `signin.spec.ts`                  |
| New transaction — happy path              | ❌                        | ❌                                                  | ✅ `add-transaction.spec.ts`         |
| New transaction — dedup                   | ⚠️ indirect               | ✅                                                  | ❌                                   |
| New transaction — invalid input           | ❌                        | ❌                                                  | ❌                                   |
| FX conversion — happy                     | ✅                        | ❌                                                  | ❌                                   |
| FX conversion — stale rate                | ✅                        | ❌                                                  | ❌                                   |
| FX conversion — API down                  | ✅                        | ❌                                                  | ❌                                   |
| Import upload                             | ❌                        | ❌                                                  | ⚠️ inside `import-full-flow.spec.ts` |
| Import parse — success                    | ✅ `route.test.ts`        | ❌                                                  | ✅ (mocked LLM)                      |
| Import parse — Gemini failure             | ✅                        | ❌                                                  | ❌                                   |
| Import finalize — success                 | ✅                        | ❌                                                  | ✅                                   |
| Import finalize — partial FX failure      | ✅ path                   | ❌                                                  | ❌                                   |
| Import finalize — batch stuck `parsing`   | ❌                        | ❌                                                  | ❌                                   |
| Import retry                              | ✅                        | ❌                                                  | ❌                                   |
| Account deletion — initiate               | ✅                        | ❌                                                  | ✅ `export-delete.spec.ts`           |
| Account deletion — cancel                 | ✅ `cancel-token.test.ts` | ❌                                                  | ❌                                   |
| Categorization cascade — rule/alias/fuzzy | ✅                        | ✅                                                  | ❌                                   |
| Categorization cascade — history          | ✅                        | ❌                                                  | ❌                                   |
| Money formatting                          | ✅                        | ❌                                                  | ❌                                   |
| Export data                               | ✅                        | ❌                                                  | ✅                                   |
| Rate limit enforcement                    | ✅ unit                   | ❌ RPC untested                                     | ❌                                   |
| RLS multi-user isolation                  | ❌                        | ✅ (accounts, tx, categories, merchants, fx, audit) | ❌                                   |

### Top 5 Named Missing Tests

1. **`finalizeImport/stuck-parsing` — batch stuck in parsing state (highest risk)**  
   A concurrent finalize call while parse is running skips the `BAD_STATE` guard, runs the RPC against an incomplete staging set, producing partial imports with no error.

   ```
   batch.status = 'parsing'
   result = finalizeImport({ batchId })
   expect(result).toEqual({ success: false, error: 'BAD_STATE' })
   expect(rpcSpy('finalize_import_batch')).not.toHaveBeenCalled()
   ```

2. **`addTransaction/unit: invalid input rejected pre-DB`**  
   No test verifies the Zod guard on `amountMinor = 0` or non-ISO dates. A missing guard silently inserts malformed rows that corrupt balances.

   ```
   result = createTransaction({ amount: '0', date: 'not-a-date', accountId })
   expect(result.error).toBe('VALIDATION_ERROR')
   expect(supabase.insert).not.toHaveBeenCalled()
   ```

3. **`rateLimit/rls: check_rate_limit_and_record enforced in DB`**  
   Unit tests mock the RPC. The SQL function is never exercised. A misconfigured window exposes unlimited Gemini calls.

   ```
   for i in 1..IMPORT_PARSE_MAX: callRPC() → expect data=true
   callRPC() → expect data=false (over limit)
   ```

4. **`importFinalize/e2e: EXTERNAL_SERVICE_ERROR surfaces to user`**  
   No E2E confirms the UI shows the error and leaves the batch recoverable (not silently swallowed).

   ```
   seed batch; mock convertToBase to throw
   POST finalize → expect 500 + error='EXTERNAL_SERVICE_ERROR'
   GET batch.status → expect 'ready' (not corrupted to 'imported')
   ```

5. **`accountDeletion/e2e: cancel link reverts deleted_at`**  
   Cancel flow is untested end-to-end; the replay vulnerability (SE-1) is exploitable without it.
   ```
   trigger deletion; get cancel link from email
   GET /auth/otkazi-brisanje?token=<valid>
   expect profile.deleted_at == null
   expect redirect to /pocetna
   ```

### Parser Benchmark

- F1 targets: per-bank ≥ 0.90, overall ≥ 0.93. All 5 banks × 5 fixtures = 25 golden pairs. ✅
- Methodology: micro-averaged F1 with Levenshtein ≤10% on description, exact on date + amount + currency.
- **No latency SLO** — Vitest 180s total budget only.
- **No adversarial fixtures** — no noisy scans, rotated text, or corrupt PDFs in `tests/fixtures/pdfs/`.

### CI Gate Gaps

- ❌ Coverage thresholds (`vitest.config.ts`) never enforced in CI — `pnpm test` runs without `--coverage`.
- ✅ Lint + typecheck on every PR.
- ❌ E2E (`@slow` Playwright) only on `main` push, not PRs.
- ❌ No PR coverage-delta comment.

---

## Phase 9 — Production Risks Checklist

### Data Loss Risks

| Risk ID  | Description                                                                                                                               | Probability | Impact | Severity |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | -------- |
| ~~DL-1~~ | ~~`update_account_balance` trigger no-op~~ — **resolved**: implemented in 00013/00035/00036 with backfill + integrity test (now CI-gated) | n/a         | n/a    | ✅       |
| DL-2     | Transfer pair symmetry not DB-enforced; crash leaves one-legged transfer                                                                  | Med         | High   | **High** |
| DL-3     | Cron vs. cancel-deletion race on `deleted_at`                                                                                             | Low         | High   | Med      |
| DL-4     | `audit_log` FK carve-out permits UPDATE setting `user_id = NULL`                                                                          | Low         | High   | Med      |
| DL-5     | FX cast through `double precision` at RPC boundary; lossy vs `numeric(20,10)`                                                             | Med         | Med    | **High** |
| DL-6     | Inline FX rounding at `summary.ts:97`, `receipt-scan-client.tsx:48`                                                                       | High        | Low    | Med      |
| DL-7     | `parsed_transactions` orphans accumulate on rejected imports                                                                              | High        | Low    | Med      |
| DL-8     | 100+ manual `eq('user_id')` calls; one omission = cross-tenant data leak                                                                  | Med         | High   | **High** |

### Security Risks

| Risk ID | Description                                                                     | Probability | Impact | Severity   |
| ------- | ------------------------------------------------------------------------------- | ----------- | ------ | ---------- |
| SE-1    | Cancel-token no replay protection; captured link replays magic-link to attacker | Med         | High   | **High**   |
| SE-2    | Non-constant-time bearer compare in cron                                        | Low         | High   | Med        |
| SE-3    | Gemini prompt injection; no post-parse plausibility validation                  | Med         | Med    | **High**   |
| SE-4    | No CSP/HSTS/X-Frame-Options/Referrer-Policy                                     | High        | Med    | **High**   |
| SE-5    | PDF MIME by claim only; no magic-byte sniff                                     | Med         | Low    | Low        |
| SE-6    | PII leaks into Vercel logs via error strings                                    | High        | Med    | **High**   |
| SE-7    | PII redaction misses names, phones, emails, non-BiH IBANs                       | High        | Med    | **High**   |
| SE-8    | Unnecessary `rate_limits` INSERT policy                                         | Low         | Low    | Negligible |

### Downtime / Availability Risks

| Risk ID  | Description                                                                                                 | Probability | Impact | Severity     |
| -------- | ----------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------ |
| AV-1     | Gemini no fallback/retry/circuit-breaker; one outage = import feature down                                  | High        | High   | **Critical** |
| AV-2     | Parse route exceeds 60s for >200-row statements; batch stuck `parsing`                                      | High        | High   | **Critical** |
| ~~AV-3~~ | ~~Export non-streaming; OOM/timeout at ~100k transactions~~ — **shipped 2026-04-28** (`a233b8b`, `e93e662`) | n/a         | n/a    | ✅ Resolved  |
| ~~AV-4~~ | ~~FX loop sequential; multi-currency finalize ~30s~~ — **shipped 2026-04-28** (`5951319`, `0bc3a90`)        | n/a         | n/a    | ✅ Resolved  |
| ~~AV-5~~ | ~~`count:exact` on every transactions page; >3s at ~100k rows~~ — **shipped 2026-04-29** (`124536f`)        | n/a         | n/a    | ✅ Resolved  |
| ~~AV-6~~ | ~~FX failure leaves batch stuck `importing` permanently~~ — **shipped 2026-04-29** (`6160458`)              | n/a         | n/a    | ✅ Resolved  |

### UX-Breaking Bugs

| Risk ID | Description                                                             | Probability | Impact | Severity |
| ------- | ----------------------------------------------------------------------- | ----------- | ------ | -------- |
| UX-1    | No `error.tsx`; server throws render bare Next.js error in English      | High        | Med    | **High** |
| UX-2    | `import_batches.status` enum mismatch code vs docs                      | Med         | Med    | Med      |
| UX-3    | Edit-transaction Zod errors collapsed into one toast                    | High        | Med    | **High** |
| UX-4    | `formatMoney()` bypassed in 4 places                                    | High        | Low    | Med      |
| UX-5    | English strings leaking ("Retry", "Merchant")                           | High        | Low    | Med      |
| UX-6    | Cancel-deletion link not idempotent                                     | Med         | Med    | Med      |
| UX-7    | Import review: no "select all", no category enforcement before finalize | High        | Low    | Med      |
| UX-8    | `retryImportParse` silently consumes rate-limit slot                    | Med         | Med    | Med      |
| UX-9    | Import review: 100 unvirtualized rows, Set rebuild defeats memo         | Med         | Low    | Low      |

### Maintainability Risks

| Risk ID  | Description                                                                                     | Probability | Impact | Severity    |
| -------- | ----------------------------------------------------------------------------------------------- | ----------- | ------ | ----------- |
| ~~MT-1~~ | ~~`imports.ts` 1000 LoC, 5 concerns, no DI — largest SPOF~~ — **shipped 2026-04-29**            | n/a         | n/a    | ✅ Resolved |
| MT-2     | Coverage thresholds not enforced in CI                                                          | High        | Med    | **High**    |
| MT-3     | E2E only on main push, not PRs                                                                  | High        | Med    | **High**    |
| MT-4     | Missing: stuck-parsing test, invalid-input, rate-limit RPC, FX-failure E2E, cancel-deletion E2E | High        | Med    | **High**    |
| MT-5     | Parser benchmark: no latency SLO, no adversarial fixtures                                       | Med         | Med    | Med         |
| MT-6     | FX loop not injectable; no DI seams for failure-path testing                                    | High        | Low    | Med         |

### Cross-cutting observation

The dominant systemic pattern is **absence of structural guarantees at trust boundaries** — the code repeatedly relies on developer discipline where the platform could enforce correctness: manual `eq('user_id')` instead of RLS-only access (DL-8), app-layer balance updates instead of a real trigger (DL-1), no DB constraint on transfer pair symmetry (DL-2), enum drift between code and docs (UX-2), float FX outside the canonical helper (DL-5/DL-6), and unvalidated Gemini output flowing straight into review (SE-3). A single program of work — push every invariant down to the database and centralize all FX/format/parse logic behind one injectable module — would close DL-1, DL-2, DL-5, DL-6, DL-8, SE-3, UX-2, UX-4 and materially reduce MT-1. Fixing this single root cause retires more risk than any other intervention available before launch.

---

## Phase 10 — Prioritized Hardening Plan

### Section A: Full Prioritized Backlog

#### 🔴 Critical

| Risk ID  | Tier | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Impact                                                                       | Fix approach                                                                                                 | Complexity | Model                                                                                    |
| -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------- |
| AV-1     | 🔴   | Gemini has no fallback/retry/circuit-breaker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Any blip = total import feature outage                                       | Wrap `lib/parser/llm-parse.ts` in retry-with-backoff + circuit breaker; surface `degraded` status to UI      | L          | **Sonnet 4.6** — well-known retry/breaker pattern, library wiring                        |
| AV-2     | ⚠️   | Parse route exceeds 60s for >200-row statements; batches stranded in `parsing`. **Code shipped, feature-flag OFF in prod (2026-04-28).** Pipeline moved to Inngest queue (`feat(AV-2)`, PR #8) with watchdog cron and `enqueued` transitional state. Cutover attempted: events delivered, function executed — but every `step.run()` is a fresh Vercel serverless invocation bound by the project's plan-tier `maxDuration`. On Hobby (60s cap) the `run-pipeline` step times out for any statement large enough to need >60s of Gemini + extraction, exactly the case AV-2 was meant to fix. `IMPORTS_ASYNC` is unset in prod env until either (a) the project upgrades to Vercel Pro and `maxDuration` bumps to 300s, or (b) the pipeline is refactored into per-page Inngest steps. Runbook: `docs/runbooks/av2-async-cutover.md`. Sync path remains the live import path on Hobby; works for small/medium statements only.                                                                                       | n/a                                                                          | n/a — shipped                                                                                                | n/a        | n/a                                                                                      |
| ~~MT-1~~ | ✅   | ~~`imports.ts` 1000 LoC, 5 concerns, no DI~~ — **shipped 2026-04-29.** Razloženo u `lib/server/actions/imports/` (5 fokusiranih action fajlova: `upload.ts` 155 LoC, `review.ts` 390 LoC, `finalize.ts` 86 LoC thin orchestrator, `lifecycle.ts` 251 LoC, `shared.ts` 103 LoC) + `index.ts` re-export. Pure pipeline ekstraktovan u `lib/server/imports/finalize-pipeline.ts` (288 LoC, 4 phase-funkcije: `loadFinalizeContext`, `prepareImportRows`, `filterDuplicates`, `persistFinalizedBatch`) + `finalize-types.ts`. **DI seam:** `FinalizeDependencies` interface omogućava test injection FX resolvera bez `vi.mock` ceremonije; dokazano s 4 nova testa (`__tests__/lib/server/imports/finalize-pipeline.test.ts`). Public API nepromjenjen — svih 5 callsite-a (3 client komponente + 2 test fajla) rade bez izmjene. 469 testova zelenih (4 nova). Audit fix approach (`parse.ts`/`fx.ts`) napušten — pravi concerns u fajlu su upload/review/finalize/lifecycle, ne parsing (koji živi u `lib/parser/*`). | n/a                                                                          | n/a — shipped                                                                                                | n/a        | n/a                                                                                      |
| ~~DL-1~~ | ✅   | ~~`update_account_balance` trigger is a no-op~~ — **AUDIT WAS WRONG.** The placeholder TODO at `00001_initial_schema.sql:127` was superseded by `00013_account_balance_trigger.sql` (full re-sum on INSERT/UPDATE/DELETE), `00035_account_balance_multi_currency.sql` (cross-currency fix), and `00036_account_ledger_cents.sql` (single-source-of-truth column). Each migration ships its own idempotent backfill. Integrity test: `__tests__/rls/account-balance-trigger.test.ts` (9 scenarios incl. drift-sweep). **Real residual gap closed in this report's follow-up:** the integrity test was gated on `RUN_INTEGRATION_TESTS=1` and never ran in CI — fixed by adding `integration-tests` job to `.github/workflows/ci.yml`.                                                                                                                                                                                                                                                                                 | n/a                                                                          | n/a — already implemented                                                                                    |
| DL-2     | 🔴   | Transfer pair symmetry not DB-enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Crash mid-write leaves phantom income/expense                                | Add deferred constraint or `transfer_pairs` join table; wrap creation in transaction                         | L          | **Opus 4.7** — deferred constraint semantics, atomic transaction design                  |
| DL-5     | 🔴   | FX cast through `double precision` at RPC boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Multi-currency totals drift cents; violates spec                             | Change RPC signatures to `numeric(20,10)`; remove `::float` casts; add property test for round-trip equality | M          | **Sonnet 4.6** — systematic type change across RPC boundary + TypeScript + property test |
| DL-8     | 🔴   | 100+ manual `eq('user_id')` filters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | One missing call leaks another user's data                                   | Enforce RLS as sole gate; add custom ESLint rule; audit + remove redundant filters                           | L          | **Sonnet 4.6** — ESLint plugin authoring + codebase-wide audit sweep                     |
| SE-1     | 🔴   | Cancel-token no replay protection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Captured email link hijacks account-deletion + mints magic-link for attacker | `deletion_cancel_tokens` table with `jti + consumed_at`; reject replays                                      | M          | **Sonnet 4.6** — standard single-use token pattern, well-defined                         |
| SE-3     | 🔴   | Gemini prompt injection; no plausibility validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Malicious PDF injects fake transactions                                      | Post-parse: dates within statement period, `\|amountMinor\| < 10^11`, strip injection markers                | M          | **Sonnet 4.6** — Zod schema + date-range logic + regex; rules fully specified            |
| SE-4     | ⚠️   | No security headers — **partially resolved 2026-04-28.** HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy ship enforced in `next.config.ts`. CSP ships in **report-only mode**, not enforce: a 2026-04-28 enforce flip blanked the production app within minutes (one or more inline scripts — Next.js runtime hydration, Sentry, or Vercel Analytics — not covered by `script-src 'self'`). Hot-reverted via PR #19. Re-enable plan: walk every primary route with DevTools open, capture every CSP violation, then either add the missing source to the directive set or switch to nonce-based `script-src` via Next.js middleware. Verify on Vercel preview before flipping production.                                                                                                                                                                                                                                                                                     | S                                                                            | **Haiku 4.5** — config-only; directives fully specified in this report                                       |
| SE-6     | 🔴   | PII leaks into Vercel logs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | GDPR breach on every parse failure                                           | Centralized `logSafe()` via pino with redact; ESLint `no-console` rule                                       | M          | **Sonnet 4.6** — pino setup + redact config + ESLint rule                                |
| SE-7     | 🔴   | PII redaction misses names, phones, emails, non-BiH IBANs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Pre-Gemini redaction is incomplete                                           | Add `libphonenumber-js`, email regex, ISO IBAN regex; expand tests                                           | M          | **Sonnet 4.6** — library integration + regex expansion; patterns well-documented         |

#### 🟠 High

| Risk ID  | Tier | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Impact                                     | Fix approach                                                                            | Complexity | Model                                                                                   |
| -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| ~~AV-3~~ | ✅   | ~~Export non-streaming~~ — **shipped 2026-04-28.** `ReadableStream` + keyset cursor (`id ASC`, 1000-row chunks) in `app/api/export/data/route.ts` (commit `a233b8b`). Audit-log insert moved before stream so mid-flight failures don't desync rate-limit. `maxDuration` capped at 60s to match Vercel Hobby ceiling — bump to 300 on Pro upgrade per `av2-async-cutover` runbook (commit `e93e662`). Helpers split into `gateExportRateLimit`, `logExportAuditStart`, `fetchExportHeader`, `streamExportTransactions` (`lib/export/build-user-export-json.ts`) + `buildExportStream` (`lib/export/stream-builder.ts`). Tests: `__tests__/lib/export/stream-builder.test.ts` (6 unit). E2E unchanged (order-agnostic). | n/a                                        | n/a — shipped                                                                           | n/a        | n/a                                                                                     |
| ~~AV-4~~ | ✅   | ~~FX loop sequential~~ — **shipped 2026-04-28.** `resolveFxRatesForBatch` (`lib/fx/batch-resolver.ts`) deduplicates `(from, to, date)` triplets and resolves in parallel via `Promise.all` (commit `5951319`); `finalizeImport` consumes the `Map<string, ResolvedFxRate>` cache synchronously. `resolveFxRate` extracted from `convertToBase` (`lib/fx/convert.ts`). Tests: `lib/fx/batch-resolver.test.ts` (6) + `__tests__/actions/imports.test.ts` mock-isolation fix (commit `0bc3a90`).                                                                                                                                                                                                                          | n/a                                        | n/a — shipped                                                                           | n/a        | n/a                                                                                     |
| ~~AV-5~~ | ✅   | ~~`count:exact` on every transactions page~~ — **shipped 2026-04-29.** `count:estimated` in `app/(app)/transakcije/page.tsx` (commit `124536f`). PostgREST hybrid: exact for <1000 results (covers typical current-month filter), planner estimate above (~30× faster for wide queries). `formatTotalCount()` in `transactions-client.tsx` prefixes counts >1000 with `≈` and formats as `99.8k`/`1.2M` to signal approximation. No index change, no migration. Cursor pagination deferred (separate plan — UX contract change).                                                                                                                                                                                       | n/a                                        | n/a — shipped                                                                           | n/a        | n/a                                                                                     |
| ~~AV-6~~ | ✅   | ~~FX failure leaves batch stuck `importing` forever~~ — **shipped 2026-04-29.** `markBatchFailed()` in `lib/server/actions/imports.ts` sets `status='failed'`, `error_message='fx_unavailable'` at all 3 FX failure sites (commit `6160458`). `retryImportFinalize()` flips `failed→ready` without resetting `parsed_transactions`. `ImportBatchFailedClient` branches retry: `fx_unavailable` → `retryImportFinalize`, others → `retryImportParse`. Bosnian copy in `importBatchErrorMessageForUser`. 5 new unit tests.                                                                                                                                                                                               | n/a                                        | n/a — shipped                                                                           | n/a        | n/a                                                                                     |
| UX-1     | 🟠   | No `error.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Bare Next.js error in English on any throw | Add localized `app/(app)/error.tsx` + segment-level boundaries                          | S          | **Haiku 4.5** — standard Next.js boilerplate, copy already in Bosnian                   |
| UX-3     | 🟠   | Edit-transaction Zod errors collapsed into one toast                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | User can't identify offending field        | Map `error.issues` to field-level messages via `setError` per field                     | S          | **Sonnet 4.6** — form state wiring, existing pattern to follow                          |
| MT-2     | 🟠   | Coverage thresholds not in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Quality regressions ship silently          | Add `--coverage` gate to GitHub Actions (70% lines, 60% branches)                       | S          | **Haiku 4.5** — one-line CI config change                                               |
| MT-3     | 🟠   | E2E only on main push                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Regressions land before detection          | Move Playwright to `pull_request`; `@slow` tier remains opt-in                          | S          | **Haiku 4.5** — CI workflow YAML edit only                                              |
| MT-4     | 🟠   | 5 critical tests missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Highest-risk paths unverified              | Write stuck-parsing, invalid-input, rate-limit RPC, FX-failure E2E, cancel-deletion E2E | L          | **Sonnet 4.6** — test authoring across different layers; specs fully defined in Phase 8 |

#### 🟡 Medium

- DL-3 — Serialize cron + cancel via `SELECT ... FOR UPDATE` on user row _(Sonnet 4.6 — concurrency + SQL)_
- DL-4 — Drop FK carve-out; allow only INSERTs on `audit_log` _(Haiku 4.5 — migration + trigger tweak)_
- DL-6 — Replace inline FX at `summary.ts:97` + `receipt-scan-client.tsx:48` with `lib/fx/convert` _(Haiku 4.5 — 2-file search-replace)_
- DL-7 — Nightly cron to delete `parsed_transactions` for terminal-failed batches _(Sonnet 4.6 — cron + SQL)_
- SE-2 — `crypto.timingSafeEqual` in cron bearer compare _(Haiku 4.5 — one-line change)_
- UX-2 — Single source of truth for `import_batches.status`; regenerate docs from enum _(Sonnet 4.6 — enum alignment across TS + SQL)_
- UX-4 — Replace 4 manual money formats with `formatMoney()` _(Haiku 4.5 — 4-file targeted replacements)_
- UX-5 — Extract "Retry"/"Merchant" to `messages/bs.json` _(Haiku 4.5 — string extraction)_
- UX-6 — Make cancel-deletion link idempotent (noop on already-cancelled) _(Sonnet 4.6 — response-logic + copy)_
- UX-7 — Add "select all" checkbox + block finalize until all rows have a category _(Sonnet 4.6 — UI state management)_
- UX-8 — Rate-limit retry shares parent slot or refunds on 429 _(Sonnet 4.6 — quota logic + UI feedback)_
- MT-5 — Add p95 SLO + adversarial fixtures to parser benchmark _(Sonnet 4.6 — benchmark test additions)_
- MT-6 — Inject FX client via DI to enable mocking _(Sonnet 4.6 — DI pattern, minimal surface)_

#### 🟢 Low

- SE-5 — Magic-byte sniff via `file-type` (5 lines) _(Haiku 4.5)_
- SE-8 — Drop unnecessary `rate_limits` INSERT policy _(Haiku 4.5 — migration only)_
- UX-9 — Virtualize import-review rows with `react-virtual`; memoize selection Set _(Sonnet 4.6 — library integration)_

### Section B: Week-1 Minimal Hardening Set

1. **DL-8** — Closes the largest blast-radius bug; one missed `eq('user_id')` is a cross-tenant data leak that is hard to detect post-launch.
2. ~~**DL-1**~~ — **already resolved.** Replaced in week-1 slot by **MT-2** (coverage gates in CI) so quality regressions stop shipping silently while the rest of the week-1 set is implemented.
3. **DL-5** — Numeric-precision fix is cheap (M) and unblocks correct multi-currency totals across all views.
4. **SE-4** — One-file header config delivers all baseline browser hardening before any real user loads the app.
5. **SE-6** — Without log redaction every other bug becomes a GDPR incident in production.
6. **SE-1** — Replay-safe cancel tokens must land before any real account-deletion email is ever sent.
7. **SE-3** — Plausibility validator is the only defense against adversarial PDFs in v1 before a more sophisticated mitigation is possible.
8. **AV-1** — Retry + circuit breaker on Gemini converts most outages from total to degraded, preserving the core value proposition.
9. **AV-6** — Stuck-`importing` recovery prevents the first FX hiccup from becoming the first support ticket.
10. **UX-1** — Localized `error.tsx` ensures any remaining uncaught error surfaces in Bosnian with a recovery action, not a bare stack trace.

This set is internally consistent: every item is a leaf change with no dependency on another listed item, and none requires the deferred refactors (MT-1, AV-2, AV-3). It prioritizes irreversible harms — data corruption, PII exfiltration, feature-breaking outages — while UX-1 guarantees failures are legible to real users.

---

## Phase 11 — Execution Strategy

### 11.1 Dependency Graph

Implicit sequencing within Week-1:

- SE-6 → SE-1 — token-revocation failures must be observable before tightening auth-adjacent flows
- SE-6 → AV-1 — circuit breaker state transitions require structured logging to be useful
- AV-1 → AV-6 — recovery RPC piggybacks on the failure-classification taxonomy AV-1 introduces
- ~~DL-8 (RLS lint) → DL-1 (balance trigger)~~ — DL-1 is already resolved, no longer in the dependency graph
- SE-3 → AV-6 — plausibility errors should route through the same `import_failed` bucket

Fully parallelizable (no mutual dependencies): **DL-5, SE-4, UX-1, DL-8**.

### 11.2 Week-1 Execution Order

Human owns: migrations, RPC contracts, auth-token logic, CSP rollout. Agent owns: lint rules, header config, retry wrappers, error boundaries, validator schemas — all under human review at PR merge.

| Day | Human track                                                   | Agent track                                                 |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | MT-2 coverage gates in CI; smoke-test integration-tests job   | SE-6 `logSafe()` + ESLint `no-console` rule                 |
| 2   | DL-5 FX `numeric(20,10)` RPC contract draft                   | DL-8 RLS lint rule + sweep redundant `eq('user_id')`        |
| 3   | DL-5 FX `numeric(20,10)` migration + backfill                 | SE-4 CSP/HSTS/XFO/Referrer headers (report-only first)      |
| 4   | SE-1 single-use jti cancel tokens (depends on SE-6 landing)   | AV-1 Gemini retry + circuit breaker; UX-1 `app/error.tsx`   |
| 5   | SE-3 plausibility validator review + merge; AV-6 recovery RPC | SE-3 schema draft; AV-6 catch-path wiring; buffer for fixes |

SE-4 ships in `report-only` mode Day 3 so the agent can iterate headers without breaking anything.

### 11.3 Week-2 Parallel Tracks

**Refactoring / product track (human-led):**

- AV-3 stream export — touches response handler, needs memory profiling
- AV-4 parallelize FX loop — small but changes failure semantics under partial rejection
- AV-5 cursor pagination — UX contract change on list endpoints
- UX-3 field-level Zod errors — form-state work coupled to existing edit screen

**CI / test track (agent-led, human-reviewed):**

- MT-2 `--coverage` flag — pure CI config; no app logic change
- MT-3 E2E on PRs — workflow file + concurrency tuning
- MT-4 five missing critical tests — large but mechanical; gates MT-1 in Week 3

### 11.4 Regression-Risk Zones ("Do Not Touch")

1. **`lib/server/actions/imports.ts` — parse pipeline**  
   Monolithic, implicit ordering between dedupe, FX, and categorization. Any edit risks cross-concern interference.  
   **Gate:** full import E2E (`@slow`), dedupe unit suite, FX-failure recovery test must all be green. Do not touch until MT-4 lands.

2. **`update_account_balance` trigger + any `accounts.balance` writer** (still a do-not-touch zone even though DL-1 is resolved)  
   Trigger lives in `00013/00035/00036`. Double-write or trigger recursion silently corrupts balances for all users.  
   **Gate:** all 9 scenarios in `__tests__/rls/account-balance-trigger.test.ts` (incl. the drift-sweep) green in the new CI `integration-tests` job before any change ships.

3. **Cancel-token / `jti` store (post SE-1)**  
   Replay or race here is an auth bypass with account-takeover potential.  
   **Gate:** single-use redemption test, concurrent-redeem race test, expired-token rejection test all green.

4. **FX RPC boundary (`numeric(20,10)` casts)**  
   `double precision` drift compounds per transaction and appears in aggregate reports.  
   **Gate:** FX round-trip precision property test, historical-rate idempotency test, multi-currency aggregate snapshot.

5. **RLS policies + ownership sweeps (DL-8)**  
   One policy gap = cross-tenant data access. ESLint rule helps but is not a substitute for per-table integration tests.  
   **Gate:** per-table cross-user denial integration tests, `audit_log` FK regression test, lint rule passing with zero suppressions.

### 11.5 Release Gates

| Item                            | Feature flag needed?      | Ship dark?                                 | Migration window required?                                                 |
| ------------------------------- | ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| SE-4 (security headers)         | No                        | Yes — CSP `report-only` 48h before enforce | No                                                                         |
| ~~DL-1~~ (balance trigger)      | n/a                       | n/a                                        | ✅ Already shipped in 00013/00035/00036 with idempotent backfills          |
| DL-5 (RPC type fix)             | No                        | Ship as additive `_v2` RPC, then cut over  | Short window for client switch                                             |
| AV-2 (background parse queue)   | **Yes** (`imports.async`) | Shadow-enqueue + compare before flip       | No (app-layer only)                                                        |
| MT-1 (imports.ts decomposition) | No                        | Pure refactor                              | No — gate: MT-4 green, coverage delta non-negative, import E2E green on PR |

---

## Phase 12 — Engineering Discipline Upgrade

### 12.1 Developer Workflow

**Pre-commit hook addition.** Add `knip` to the Husky + lint-staged pipeline to catch unused exports and dead code before commit. Rationale: manual ownership checks scattered across 100+ locations become dead code risk the moment a wrapper replaces them — `knip` catches the orphan immediately.

**ADR cadence.** Write an ADR when: (a) a new Supabase table is added (RLS policy rationale must be recorded), (b) a money operation is introduced or changed (`bigint` invariant reasoning), (c) a third-party service is adopted. Use the MADR template. Store in `/docs/decisions/`. Trigger: any PR touching `supabase/migrations/` or `lib/fx` requires an ADR reference in the PR description.

**Definition of done (7 items, each grounded in an audit finding):**

1. RLS policy exists and is tested for any new user-owned table _(finding: no structural ownership guarantee)_
2. All money values stored and returned as `bigint` minor-unit cents; no `number` cast in the diff _(finding: bigint invariant broken in 4 places)_
3. `error.tsx` boundary exists for any new route segment _(finding: `error.tsx` absent everywhere)_
4. No raw English copy in JSX; strings routed through localization lookup _(finding: "Retry", "Merchant" leaking)_
5. No `console.log` / `console.error` containing a user field — use `logSafe()` _(finding: PII in Vercel logs)_
6. Server action has minimum required tests per §12.3 _(finding: coverage gates unenforced)_
7. Migration is additive (nullable column) or includes a rollback step _(finding: no migration release gates)_

**Automated gate.** Custom ESLint rule `no-direct-user-data-log`: errors on any `console.log/error` call whose arguments reference `user`, `email`, `userId`, `profile`, or `account`. This directly gates the class of bug that appeared most in the audit: unredacted PII leaking through unstructured logs.

### 12.2 Code Review Checklist (10 items, each < 30 seconds)

1. **RLS** — every new table in the diff has `ENABLE ROW LEVEL SECURITY` + `USING (auth.uid() = user_id)` policy
2. **Ownership** — server actions read `userId` from Supabase auth, not from request body/query
3. **Money in** — new inputs to money operations accept `bigint`; no `parseFloat`, `Number()`, or unannounced division
4. **Money out** — values displayed via `formatMoney()` exclusively, not inline arithmetic
5. **Error handling** — no `catch` block swallows silently; every catch either calls `logSafe()` or re-throws
6. **error.tsx** — any new `app/` route segment directory contains an `error.tsx` file
7. **PII in logs** — scan diff for `console.`; confirm no user-identifying field is in the message
8. **Localization** — no string literals in JSX `<>text</>` or English `aria-label` in Bosnian-facing routes
9. **Test coverage** — PR adds tests meeting the minimums in §12.3; no server action ships with zero tests
10. **Migration safety** — any `ALTER TABLE` is additive or includes an explicit rollback migration

### 12.3 Testing Discipline Minimum Bar

**Server action — minimum 3 tests:**

1. Happy path — correct return shape; DB row owned by `userId`
2. Unauthenticated call — returns `401`/redirect; no data mutation
3. Wrong-owner call — seed a row owned by user B; call as user A; assert `403` and row unchanged

**New user-owned table:** One Vitest integration test running the RLS policy directly via service-role vs. anon client, asserting that a `SELECT` as a different `auth.uid()` returns zero rows.

**New user-visible flow:** One Playwright scenario covering the full happy path from login through the visible result, asserting the final URL and at least one data value rendered on screen.

**New money operation:** One property-based test (fast-check or Vitest repeat) asserting that for all `bigint` inputs in `[0n, 999_999_999n]`, output remains `bigint`, is never negative, and round-trips through `formatMoney()` without precision loss.

### 12.4 Release Process

Current: feature branch → PR → `main` merge → Vercel auto-deploy. Two gaps allow regressions: (1) Playwright E2E does not run on PRs — only after merge to `main`; (2) Vitest coverage thresholds in `vitest.config.ts` are never evaluated in CI (`pnpm test` lacks `--coverage`). Close both: add a `pull_request` CI step running `playwright test --project=chromium` against the Vercel preview URL via `VERCEL_PREVIEW_URL` deployment webhook; replace `pnpm test` with `pnpm test --coverage` in the `verify` job so threshold failures block the PR instead of passing silently.

### 12.5 Observability Stack

**Error tracker: Sentry free tier.** Zero monthly cost under 5k errors/month, one-line Next.js SDK install, Vercel integration with automatic source-map upload — right-sized for a bootstrapped solo project with no ops team.

**5 required fields in every `logSafe()` call:**

1. `event` — machine-readable slug (e.g. `"import.parse_failed"`)
2. `userId` — Supabase UUID only, never email or name
3. `route` — Next.js pathname
4. `durationMs` — for latency trending
5. `severity` — `"info" | "warn" | "error"`

**3 fields that must NEVER appear in logs:**

1. `email` — present on `auth.users`; frequently destructured in session callbacks
2. `iban` / `accountNumber` — present in bank import payloads
3. `description` — raw transaction narrative strings that may contain personal references

**One immediate alert:** Page the founder (Slack webhook or email) when `severity: "error"` events from server actions exceed 5 in any 60-second window — the threshold at which an import pipeline failure or auth breakage is active, not transient.

---

## Audit Summary

| Category        | Critical    | High         | Medium | Low   | Resolved                  |
| --------------- | ----------- | ------------ | ------ | ----- | ------------------------- |
| Data Loss       | 0           | 3 (DL-2,5,8) | 4      | 0     | DL-1, DL-8 ✅             |
| Security        | 0           | 2 (SE-3,7)   | 2      | 2     | SE-1 ✅, SE-4 ⚠️, SE-6 ✅ |
| Availability    | 1 (AV-2 ⚠️) | 4            | 0      | 0     | AV-1 ✅                   |
| UX              | 0           | 2 (UX-1,3)   | 6      | 1     |                           |
| Maintainability | 1 (MT-1)    | 3 (MT-2,3,4) | 2      | 0     |                           |
| **Total**       | **2**       | **14**       | **14** | **3** | 5 ✅, 2 ⚠️                |

**Verdict:** The app has a solid security and architecture foundation (RLS correct, Zod everywhere, bigint money, PKCE auth, no IDOR, no open redirects). The risks are concentrated in three areas: (1) missing structural guarantees that rely on developer discipline, (2) the parse pipeline being a single fragile 1000-LoC file with no failure recovery, and (3) PII/logging gaps that become GDPR incidents the moment real users import real bank statements. The Week-1 set of 10 items closes the most severe risks without requiring the large refactors. Do not onboard real users before completing items DL-8, SE-1, SE-4, SE-6, SE-7, and AV-6 at minimum.
