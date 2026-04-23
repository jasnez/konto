# Faza 1 QA Report (dosad implementirano)

Datum: 2026-04-23  
Repo: `c:\Users\Jasne\Konto`

## Scope

QA ciklus pokriva trenutno implementirani dio Faze 1:

- `app/(app)/racuni`
- `app/(app)/kategorije`
- `app/(app)/merchants`
- `app/(auth)/shared/actions.ts`
- `app/(app)/podesavanja/actions.ts`
- `supabase/migrations/20260423160000_00007_search_merchants_rpc.sql`

Out of scope u ovom ciklusu (još placeholder/unfinished):

- `app/(app)/pocetna/page.tsx`
- `app/(app)/transakcije/page.tsx`

## Automated gates (final rerun)

- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm test` ✅ (12 files, 61 tests passed)
- `pnpm test:e2e` ✅ (6/6 passed: chromium + mobile-safari)
- `pnpm build` ✅

## Security and RLS validation

- `__tests__/rls/transactions.test.ts` pokrenut sa lokalnim Supabase env varijablama ✅ (3/3 passed)
- Dodatna A/B provjera (custom script) za:
  - `accounts` isolation ✅
  - `categories` isolation ✅
  - `merchants` isolation ✅
  - `search_merchants` cross-tenant isolation ✅

Rezultat: nema detektovanog cross-user curenja u ključnim tabelama i RPC-u.

## P0 / P1 / P2 status (zatvoreno)

### P0 (zatvoren)

- E2E suite stabilizovan i operativan.
- Dodani i prolazni minimalni E2E tokovi:
  - `__tests__/e2e/signin.spec.ts`
  - `__tests__/e2e/accounts-crud.spec.ts`
  - `__tests__/e2e/merchant-category.spec.ts`
- Dodan `__tests__/e2e/helpers.ts` za deterministički test login/cleanup.

### P1 (zatvoren)

- Test coverage gap zatvoren za server actions:
  - `app/(app)/kategorije/actions.test.ts` (novo)
  - `app/(app)/podesavanja/actions.test.ts` (novo)
  - `app/(auth)/shared/actions.test.ts` (novo)
  - `app/(app)/racuni/actions.test.ts` (proširen: delete/reorder)
  - `app/(app)/merchants/actions.test.ts` (proširen: create/update/delete)
- Setup friction zatvoren:
  - dodan `supabase/seed.sql`
- Dodatni hardening:
  - `lib/supabase/middleware.ts` sada pokriva i `/merchants`.

### P2 (zatvoren za trenutni scope)

- Nema otvorenih TODO/FIXME regresija u implementiranim modulima.
- Poznati placeholder ekrani ostaju:
  - `/pocetna`
  - `/transakcije`
- Ovo je i dalje svjesno out-of-scope za ovaj QA ciklus (nije regresija).

## Go/No-Go odluka (final)

**Odluka: GO za nastavak razvoja u okviru implementiranog Faza 1 scope-a.**

Nakon zatvaranja P0/P1/P2 stavki iz ovog plana, trenutno nema blokirajućih QA nalaza za module:

- `racuni`
- `kategorije`
- `merchants`
- auth/profile server actions

## Relevantni dodatni patch-evi tokom QA

- `playwright.config.ts` (stabilizacija webServer/env setupa za E2E)
- `app/api/test-auth/login/route.ts` (test-only auth bridge, non-production)
- `components/auth/email-otp-form.tsx` (hash-session handling za robustniji login)
- `app/auth/callback/route.ts` (code/token-hash callback kompatibilnost)
