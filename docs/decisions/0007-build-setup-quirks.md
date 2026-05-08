# ADR 0007: Build Setup Quirks (Sentry × Turbopack, ESLint flat-config)

## Status

Prihvaćeno (Faza 3 / OPS.3 audit 2026-05-08) — **fiksira poznata mjesta gdje "natural" build setup pravi probleme**

## Kontekst

Konto koristi **Next.js 15 (App Router) + React 19 + Sentry 10 + ESLint 9 (flat config) + Turbopack (dev)**. Većina ovih komponenti je relativno svježa i imaju poznate međusobne nekompatibilnosti koje su otkrivene tokom razvoja. Ako neko (čovjek ili AI agent) "popravi" `package.json` ili `next.config.ts` "po best practice-u" bez znanja ovih gotcha-a, build pada — često sa nejasnim error porukama koje se ne odnose na pravi uzrok.

Ovaj ADR fiksira poznate gotcha-e tako da budu vidljivi u repo-u, ne samo u memoriji jednog developera (ili AI agent-a sa scoped memorijom).

## Odluka

### 1. Sentry je nekompatibilan sa Turbopack za **production build**

**`package.json` MORA glasiti:**

```json
"scripts": {
  "build": "next build",
  "dev": "next dev --turbopack"
}
```

**Ne smije** biti `"build": "next build --turbopack"`. Sentry-jev `withSentryConfig` koristi webpack plugin (source map upload, instrumentation injection) koji Turbopack ne podržava. Sa `--turbopack` flag-om u build skripti:

- Turbopack tihim sucessom ignorira `withSentryConfig`
- Source maps se ne uploaduju u Sentry
- Server instrumentation je djelimično primijenjena → krhki Sentry behavior
- Build "uspijeva" ali production observability je razbijena

**Verifikovano:** PR #154 (PR-2 follow-up) i PR #158 (turbopack-fix). Vidi commit `742f335 fix(build): drop --turbopack from production build`.

Turbopack ostaje u `dev` skripti — tu nema Sentry instrumentation injection-a, samo Fast Refresh + bundle.

### 2. ESLint flat config (`eslint.config.mjs`) — ne miješati sa `.eslintrc.*`

Konto koristi **isključivo** flat config (ESLint 9+ preferred). Ako stari alat (npr. `lint-staged` template) doda `.eslintrc.json`, ESLint će raditi double-config inheritance i ignorirati custom rules iz flat config-a.

**Provjera:**

```bash
ls -la .eslintrc* 2>/dev/null  # MORA biti prazno
```

Custom rules — `local/no-unguarded-mutation` (DL-8 enforcement) i `local/no-untranslated-jsx-strings` (N20 anglicism guard) — žive u flat config-u i u `eslint-rules/` folderu. Ne premještaj.

### 3. Build warnings koji su benigni i NE smiju biti "fixed"

Tokom build-a izlaze sljedeći warnings; svi su poznati i ignorisani:

| Warning                                                              | Razlog                                                                                                            | Šta NE raditi                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `[@sentry/nextjs] DEPRECATED ... (some-helper)`                      | Sentry SDK postepena migracija helpers-a; verzija koju koristimo emituje upozorenje za helpers koji još rade.     | Ne nadograditi Sentry SDK preko trenutne verzije bez prethodnog testiranja Edge runtime config-a. |
| `lib/parser/extract-text.ts uses import.meta`                        | Next.js bundler upozorava na `import.meta.url`; legitimno korišćenje za worker URL.                               | Ne refaktorisati. `import.meta.url` je standard za worker URL resolution.                         |
| `Couldn't auto-detect ESLint config (looking for .eslintrc.json...)` | Upozorenje od starije linter integracije koja ne razumije flat config; ESLint 9 i naš custom flat config rade ok. | Ne dodavati `.eslintrc.json` da "ušutiš" warning. Vidi tačku 2 — to bi razbilo custom rules.      |

### 4. Vercel `NEXT_PUBLIC_*` env vars zahtijevaju **fresh deploy**, ne cached redeploy

Vercel inline-uje `NEXT_PUBLIC_*` env varijable u client bundle u trenutku build-a. Ako se env var promijeni preko Vercel UI-a, sledeći redeploy iz cache-a NE pravi novi build → stara vrijednost ostaje u client JS-u.

**Pravilo:** kada mijenjaš `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SENTRY_DSN`:

1. Promijeni env var u Vercel UI-u.
2. **Redeploy sa "Use existing Build Cache" OFF** (Vercel UI checkbox).

Drugačije: client JS i dalje koristi staru vrijednost.

### 5. `pnpm install` postinstall hook genaiše `supabase/types.ts`

Postinstall hook (`pnpm install`) pokreće `node scripts/supabase-gen-types.mjs --local --tolerant`. To regeneriše `supabase/types.ts` iz lokalnog Supabase stack-a (ako je up) ili tiho preskače (ako nije).

**Tolerant flag** (`--tolerant`) sprečava da `pnpm install` pukne na CI gdje Supabase nije pokrenut. Ne uklanjati.

Kada se promijeni shema preko nove migracije:

```bash
pnpm supabase:reset    # primjenjuje migracije lokalno
pnpm supabase:types    # regeneriše types.ts (bez --tolerant — failure ovde JE bug)
```

## Posljedice

### Pozitivne

- Novi developer ili AI agent vidi ove gotcha-e u repo-u; ne mora ponovo da otkriva (i lomi build) tokom kratkog rada na PR-u.
- Specifični warnings su explicitly listed kao benign — ne troše vrijeme za "fix".
- Sentry × Turbopack pravilo je sada repo-vidno, ne samo u developer memoriji.

### Negativne / trade-off

- ADR ostari ako se Sentry ili Turbopack nadograde i kompatibilnost se popravi. Treba revisit godišnje.

## Povezano

- `package.json` — build/dev skripte (vidi `scripts` blok).
- `eslint.config.mjs` — flat config sa custom rules.
- `next.config.ts` + `withSentryConfig` wrapper.
- `instrumentation.ts` — Sentry server/edge runtime selektor.

## Change log

| Datum      | Izmjena                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-05-08 | Inicijalna verzija (OPS.3 iz Supabase architecture audit-a 2026-05-08; promovira feedback memorije u repo docs). |
