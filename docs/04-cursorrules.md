# Konto — Cursor Rules & Workflow

**Verzija:** 1.0 · **Datum:** april 2026.
**Status:** Živi dokument. Ažurira se svaki put kad otkrijemo novi anti-pattern ili poboljšanje workflow-a.

---

## 1. Svrha dokumenta

Ovaj dokument radi dvije stvari:

1. **Sekcija 2** je **tačan sadržaj `.cursorrules` fajla** koji ide u root repo-a. Kopiraj ga doslovno. Cursor ga čita kao sistem prompt za svaku konverzaciju u projektu.
2. **Sekcije 3–10** su **uputstva za tebe** — kako strukturirati prompt-ove, kako davati kontekst, kad prekidati Cursor, kako pregledati generisani kod.

---

## 2. `.cursorrules` — sadržaj fajla

Kreiraj `.cursorrules` u root-u repo-a sa **tačno ovim sadržajem**:

````
# Konto — Project Rules for Cursor

You are working on Konto, a personal finance management (PFM) web app for Western Balkans (primary market: Bosnia & Herzegovina). The app parses PDF bank statements and categorizes transactions. Primary language of UI is Bosnian (Latin script).

## Critical context documents

Before making significant changes, reference these docs in the repo:
- /docs/01-architecture.md — tech stack, data model, API design, pipelines
- /docs/02-security-privacy.md — RLS, auth, encryption, GDPR
- /docs/03-design-system.md — UI components, tokens, copy guide
- /docs/05-testing.md — testing strategy, when to write tests
- /docs/06-backlog.md — epics, features, task prompts

If the user asks you to do something that conflicts with these docs, STOP and ask for clarification before coding.

## Tech stack (non-negotiable)

- Next.js 15 with App Router (no Pages Router)
- TypeScript strict mode, no `any`, no `unknown` without narrowing
- Tailwind CSS for all styling (no CSS modules, no styled-components)
- shadcn/ui + Radix for primitives
- Supabase: Postgres, Auth, Storage, Edge Functions
- Zod for all input validation (runtime + static types)
- React Hook Form for forms
- Sonner for toasts
- date-fns with `bs` locale for dates
- Lucide React for icons
- pnpm as package manager

## Monetary rules (NEVER break these)

- All money amounts are `bigint` in minor units (cents for EUR/BAM/USD, etc.)
- NEVER use float/number for money. Ever.
- NEVER use `parseFloat` on amount inputs. Use custom parser.
- BAM ↔ EUR uses fixed constant 1 EUR = 1.95583 BAM (Currency Board), not API
- Every transaction row stores: original_amount_cents, original_currency, base_amount_cents, base_currency, fx_rate, fx_rate_date
- Display formatting uses `Intl.NumberFormat('bs-BA', { style: 'currency', currency: 'BAM' })`
- Minus sign in display is Unicode `−` (U+2212), not hyphen `-`

## Authorization (non-negotiable)

- Every Server Action starts with auth check via `supabase.auth.getUser()`
- Every mutation verifies resource ownership explicitly (not just RLS)
- RLS is defense-in-depth, NOT the only layer
- Service role key is NEVER used in client-side code or exposed to client
- Never trust `user_id` from request payload — always use `auth.uid()` or getUser().id

## File structure conventions

- Server Components are default. Client Components only when interactivity is truly needed. Mark with `'use client'` at top.
- Server Actions go in `actions.ts` adjacent to the route that uses them. Start file with `'use server'`.
- One exported action per function, named in camelCase with a verb.
- Validation schemas colocated with actions, named `XxxxSchema` using Zod.
- Components in `components/` for shared, in route folder for local.
- Utilities in `lib/` grouped by domain (`lib/fx/`, `lib/supabase/`, `lib/format/`).
- Database types generated from Supabase: `supabase/types.ts`. Import as `Database['public']['Tables']['xxx']['Row']`.

## Naming conventions

- Files: kebab-case.ts (e.g. `money-input.tsx`, `create-transaction.ts`)
- Components: PascalCase (e.g. `MoneyInput`, `TransactionRow`)
- Functions: camelCase (e.g. `formatAmount`, `createTransaction`)
- Types/Interfaces: PascalCase (e.g. `Transaction`, `CreateTransactionInput`)
- Constants: SCREAMING_SNAKE_CASE (e.g. `BAM_EUR_RATE`, `MAX_PDF_SIZE`)
- DB columns: snake_case (PostgreSQL convention). Transform at boundary.
- Routes: Bosnian words in kebab-case (e.g. `/transakcije`, `/racuni/[id]`, `/uvoz`)

## Styling conventions

- Tailwind utility classes, ordered logically: layout → box → typography → color → state
- Use design tokens via CSS variables (e.g. `bg-primary`, `text-foreground`)
- Never hardcode colors in hex — use tokens
- Touch targets minimum h-11 (44px) on mobile
- `tabular-nums` on every money display

## Required patterns

### Server Action template
```typescript
'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const InputSchema = z.object({ /* ... */ });

export async function doThing(input: unknown) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: 'VALIDATION_ERROR', details: parsed.error.flatten() };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'UNAUTHORIZED' };

  // Explicit ownership check
  // Business logic
  // DB operation
  // revalidatePath for affected routes

  return { success: true as const, data: result };
}
````

### Supabase client pattern

- `lib/supabase/server.ts` — for Server Components & Actions (uses cookies)
- `lib/supabase/client.ts` — for Client Components
- `lib/supabase/middleware.ts` — for auth refresh in middleware
- Never import Supabase client from both sides in the same file

### Form pattern

- Client component with `react-hook-form` + Zod resolver
- Same Zod schema as Server Action (import/share)
- Submit calls Server Action, handles result
- Optimistic update if applicable; rollback on error

## Forbidden patterns

- NEVER `parseFloat` or `Number()` on user-entered money
- NEVER `console.log` sensitive data (email, amount, merchant_raw, notes)
- NEVER `SELECT *` in Supabase queries — always specify columns
- NEVER use `any` type; use `unknown` + narrow, or proper types
- NEVER use `dangerouslySetInnerHTML` without explicit justification comment
- NEVER write raw SQL through Supabase `rpc()` without parameterization
- NEVER commit `.env*` files or any secrets
- NEVER use Pages Router patterns (`getServerSideProps`, `_app.tsx`)
- NEVER create API routes for things Server Actions can do
- NEVER mutate props or state directly
- NEVER use `useEffect` for data fetching (use Server Components)
- NEVER use `useState` for form state (use react-hook-form)
- NEVER mix business logic in components — extract to `lib/`
- NEVER use English in user-facing strings; always Bosnian

## Testing requirements

- Every Server Action with business logic needs a unit test in `__tests__/actions/`
- Every monetary calculation needs a test with edge cases (0, negative, large values, precision)
- Every RLS policy needs an integration test (user A cannot access user B's data)
- Playwright E2E for critical flows: signin, add transaction, upload PDF, delete account
- Run tests before claiming any task is done

## Error handling

- Server Actions return `{ success: boolean, data?, error?, details? }`
- Never throw from Server Actions — always return error object
- Client catches `!result.success` and shows toast via `toast.error(...)`
- Log errors server-side with structured format: `console.error('action_name_error', { userId, error: err.message })`
- Redact PII from logs (never log merchant_raw + amount + user_id together)

## Commit messages

Use Conventional Commits format:

- `feat(scope): add transaction split functionality`
- `fix(import): handle Raiffeisen decimal separator`
- `refactor(db): extract category queries into lib`
- `docs(arch): update multi-currency section`
- `test(actions): cover transfer detection`
- `chore(deps): bump supabase-js to 2.50`

Keep subject under 72 chars, imperative mood, lowercase scope.

## When unsure

- Ask: "Which approach does the architecture doc recommend?"
- Reference the relevant section of /docs/
- Prefer proven boring solutions over clever ones
- If an action could leak data or break money math, STOP and flag it

## Performance considerations

- Dashboard queries paginated (50 rows default)
- Heavy charts use `dynamic(() => import(...), { ssr: false })`
- Images through `next/image` always
- Don't import whole lucide-react; import specific icons
- Recharts is big — only import on pages that use it

## Language & copy

- All user-facing text in Bosnian (Latin)
- Use "ti" not "Vi"
- Currency display: "1.234,56 KM" (European format)
- Dates: "15.4.2026." or "15. apr. 2026."
- Error messages: humane, not technical IDs
- See /docs/03-design-system.md section 7 for full copy guide

```

**Kraj `.cursorrules`.** Kopiraj sve između prvog i drugog trostrukog back-tick-a u fajl.

---

## 3. Kako strukturirati prompt-ove za Cursor

### 3.1 Osnovni format

Kad god zadajes task, koristi ovu strukturu:

```

# Task: [kratak naslov]

## Kontekst

[1-2 rečenice: zašto, koji feature, koji sloj]

## Reference dokumenti

- /docs/01-architecture.md sekcija X
- /docs/03-design-system.md sekcija Y
- Prethodni fajlovi: [paste putanja ako postoji]

## Zahtjev

[Šta konkretno treba uraditi — bullet points su OK]

## Acceptance criteria

- [ ] A
- [ ] B
- [ ] C

## Fajlovi koje dirnuti

- `app/.../page.tsx` (kreiraj)
- `lib/.../helper.ts` (izmijeni)

## Ne radi ovo

- [konkretne stvari koje znaš da želiš izbjeći]

```

### 3.2 Primjer konkretnog prompt-a

```

# Task: Kreiraj MoneyInput komponentu

## Kontekst

Dio Faze 1 (manual transaction entry). Komponenta se koristi za unos novčanog iznosa u formama — ne prikazuje, nego prima input. Mora raditi sa cents internally, a prikazivati user-friendly format.

## Reference

- /docs/03-design-system.md sekcija 3.3.2 (MoneyInput spec)
- /docs/01-architecture.md sekcija 4.1 (monetary rules)

## Zahtjev

Kreiraj `components/money-input.tsx` koji:

- Prima `value: bigint` (cents) i `onChange: (cents: bigint) => void` kao controlled komponentu
- Interni state drži formatiranu vrijednost kao string dok korisnik tipka
- Na blur formatira sa thousands separator (locale-aware)
- Zarez kao decimalni separator za bs-BA locale
- Desno je Currency Select (BAM, EUR, RSD, USD minimum) kroz shadcn Select
- Mobilni: inputMode="decimal"
- Focus select-uje sav tekst
- Podržava negativne vrijednosti ako je `allowNegative` prop true

## Acceptance criteria

- [ ] Unos "12,50" → onChange called sa 1250n
- [ ] Unos "-43,5" → onChange called sa -4350n (ako allowNegative)
- [ ] Unos "abc" → nema promjene state-a
- [ ] Blur "1234" → prikazano kao "1.234,00"
- [ ] Currency change ne mijenja cents value
- [ ] Test fajl `__tests__/money-input.test.tsx` pokriva sve edge cases

## Fajlovi

- `components/money-input.tsx` (kreiraj)
- `components/money-input.test.tsx` (kreiraj)
- `lib/format/parse-money.ts` (kreiraj — utility funkciju za parsing)

## Ne radi ovo

- Ne koristi parseFloat — pravi custom parser
- Ne koristi controlled input sa cents value direktno (treba string intermediate state)
- Ne hardcoduj "KM" — koristi Currency Select

```

### 3.3 Kad prepuštаеѕ šire odluke Cursor-u

Ako ne znaš tačno kako, kaži to eksplicitno:

```

Nisam siguran kako da handle-ujem case kad korisnik briše zadnju cifru u MoneyInput. Šta preporučuješ? Koji su pros/cons opcija:
A) Vrati na 0n
B) Pretvori u null (optional prop)
C) Drži string ""

Prije nego što kodiraš, objasni trade-off.

```

Cursor dobro reaguje na ovaj pristup — daje ti opcije, ti biraš.

### 3.4 Kad imaš već postojeći kod i praviš izmjene

```

# Task: Dodaj transfer pair logic u createTransaction

Već imam `app/(app)/transakcije/actions.ts` koji kreira transakciju. Sada treba dodati slučaj kad `is_transfer=true` — mora se kreirati pair transakcija u drugom računu.

[paste postojeći kod ovdje]

Proširi funkciju tako da:

- Ako `is_transfer=true` i `transfer_to_account_id` je prosljeđeno, kreiraj drugu transakciju u tom računu sa obrnutim znakom
- Obje transakcije imaju `transfer_pair_id` postavljen na id-ove jedna druge (transaction u PG — update nakon insert)
- Koristi `supabase.rpc('create_transfer_pair', ...)` umjesto dva odvojena insert-a da bi bilo atomic

Kreiraj i migration za RPC funkciju.

```

### 3.5 Kad Cursor griješi

Ne rekukiraj — korigeraj konkretno:

```

Dobro, ali dva problema:

1. Koristiš `parseFloat("12,50")` što će vratiti 12, ne 12.50, jer ne razumije zarez. Refaktoriši koristeći `parseMoneyString` iz `lib/format/parse-money.ts` (ili je kreiraj ako ne postoji).

2. Server Action ne provjerava user ownership nad account_id prije insert-a. Dodaj check iz templatea u .cursorrules.

Fix ovo u istom fajlu, ne pravi novi.

```

---

## 4. Context management

### 4.1 Šta Cursor zna iz `.cursorrules`

Sadržaj iz sekcije 2 ulazi u svaku konverzaciju automatski. **Ne moraš ga ponavljati u prompt-u.**

### 4.2 Šta Cursor treba dodatno

Iza `.cursorrules`, Cursor će vidjeti:
- Trenutno otvoreni fajl
- Fajlove koje `@file` mention-uješ
- Cijeli workspace ako uključis "codebase" search

**Pravilo:** za bilo koji task složeniji od jedne funkcije, eksplicitno referenciraj relevantne dokumente:

```

@/docs/01-architecture.md#5.2
@/docs/03-design-system.md#3.3.2

```

Ili vučeš fajlove u chat (Cursor podržava file drag).

### 4.3 Long-running tasks

Za velike taskove (npr. "Implementiraj cijeli PDF parser"), razbij na manje korake:

1. Prvi prompt: "Kreiraj samo tipove i interfejse za parser"
2. Drugi: "Sada kreiraj Raiffeisen template parser koji prima text i vraća array transakcija"
3. Treći: "Dodaj reconciliation logic"
4. Četvrti: "Integriši u Server Action"

**Nikad** u jednom prompt-u ne traži više od ~300 linija outputa. Kvalitet pada.

### 4.4 Kad prekinuti Cursor

Prekini i ispočetka ako:
- Počinje izmišljati API-je koji ne postoje ("Supabase ima funkciju `autoConvert()`" — ne postoji)
- Generisao je 500+ linija u jednom fajlu — vjerovatno treba razbiti
- Generisao kod koji krši nešto iz `.cursorrules` — podsjeti eksplicitno
- Previše "ako želite" i "mogli bismo" u odgovoru — hoće da pogađa

---

## 5. Code review checklista (prije commita)

Svaki fajl koji Cursor generiše, prije `git commit`:

### 5.1 Funkcionalno

- [ ] Radi ono što sam tražio? Testirao sam manualno?
- [ ] Test postoji i prolazi?
- [ ] Nema `console.log`-ova koji su trebali biti uklonjeni?
- [ ] Nema TODO-a koji sam ja trebao da uradim umjesto Cursor-a?

### 5.2 Monetary

- [ ] Svaki novčani amount je `bigint`?
- [ ] Nigdje `parseFloat`, `Number()`, `toFixed()` na iznosima?
- [ ] Minus znak u display-u je `−` (Unicode)?
- [ ] FX konverzija koristi tačan kurs za tačan datum?

### 5.3 Security

- [ ] Server Action počinje sa `getUser()` check-om?
- [ ] Explicitna provjera ownership-a pored RLS?
- [ ] Zod validacija na inputu?
- [ ] Nema `SELECT *`?
- [ ] Nema `service_role` keya u client kodu?

### 5.4 Types

- [ ] Strict TS prolazi bez errors?
- [ ] Nema `any`?
- [ ] Types importovani iz `Database` gdje je primjenjivo?

### 5.5 UI

- [ ] Bosanski copy?
- [ ] `tabular-nums` na money display?
- [ ] Touch target ≥ 44px na mobilnom?
- [ ] Empty / loading / error state obrađen?

### 5.6 Performance

- [ ] Nije importovan cijeli `recharts` ili `framer-motion` ako nije potrebno?
- [ ] Heavy komponente lazy-loadovane?

---

## 6. Workflow — od prompt-a do merge-a

### 6.1 Daily flow (solo founder)

```

1. Otvori backlog (/docs/06-backlog.md)
2. Izaberi sljedeći task po prioritetu
3. Kreiraj feature branch: git checkout -b feature/task-slug
4. Kopiraj task u Cursor
5. Prođi kroz Cursor interakciju do radnog koda
6. Prođi code review checklist
7. git commit po logičkim jedinicama (ne jedan massive commit)
8. git push
9. Vercel preview deploy → klikni link, manualno testiraj
10. Merge u main (solo, pa nema PR review-a)
11. Označi task u backlogu kao done

````

### 6.2 Commit cadence

- **Commit male jedinice** (jedna komponenta, jedan Server Action, jedan test set)
- Ne miješaj unrelated changes u isti commit
- Commit poruka: conventional commits format (vidi `.cursorrules`)

### 6.3 Kad backup-uje

Prije bilo kog od sljedećih, manual backup (jer si solo):
- Migration koja mijenja existing tabelu
- Izmjena RLS policy-a
- Bulk operacija na production bazi
- Upgrade Next.js/Supabase major verzije

**Backup komanda:**
```bash
supabase db dump --project-ref xxx -f backup-$(date +%Y-%m-%d-%H%M).sql
# Encrypt + upload to offsite storage (S3, Backblaze, iCloud)
````

---

## 7. Anti-patterns koje smo vidjeli i izbjegavamo

### 7.1 "LLM hallucination" obrasci

- Cursor izmišlja Supabase funkcije — **uvijek provjeri dokumentaciju**
- Cursor kombinuje syntax iz verzije X i Y (npr. Next.js 13 Pages Router + App Router) — **eksplicitno reci "App Router only"**
- Cursor importuje "utility" iz nepostojećeg paketa — **provjeri `pnpm ls` ili `package.json`**

### 7.2 Security anti-patterns

- Server Action bez `getUser()` — **stop, fix, commit**
- RLS "samo RLS" bez app-level check-a — **dodaj ownership verifikaciju**
- Validacija input-a samo na client side-u — **Zod na Server Action mora postojati**
- SSR data fetch bez user context provjere

### 7.3 Money anti-patterns

- `amount * rate` bez Round-a — **eksplicitni `Math.round(Number(cents) * rate)`**
- `toFixed(2)` umjesto `Intl.NumberFormat` — **uvijek NumberFormat**
- FX rate iz "today" za "1 januar transakcija" — **rate za datum transakcije**

### 7.4 Performance anti-patterns

- Fetching sve transakcije client-side za filtriranje — **uvijek server-side**
- Recharts na landing page-u — **lazy load**
- `useEffect` za Supabase query — **Server Component**

---

## 8. Kako ažurirati `.cursorrules`

Ovaj fajl je zivo pravilo. Ažuriraj ga kad:

- Otkriješ pattern koji Cursor stalno krši
- Dodaš novu biblioteku i treba pravilo kako je koristiti
- Promjeniš naming konvenciju
- Uvedes novu security konvenciju

**Kako:**

1. Edit `.cursorrules`
2. Commit sa poruka `chore(cursor): add rule about X`
3. Restartuj Cursor ili otvori novu chat sesiju (Cursor cache-uje)

---

## 9. "Golden path" za new feature

Kad dodaješ potpuno novi feature (npr. budžeti u Fazi 3):

**Korak 1: Arhitektonski dizajn**

```
Prompt: "Pročitaj /docs/01-architecture.md. Predloži dizajn za budget feature.
Treba da podržava: weekly/monthly/yearly period, rollover unused,
per-category ili total. Ne kodiraj još. Vrati:
- Predlog data model promjena (tabela, polja)
- Predlog RLS policy
- Predlog Server Actions (imena + signature-i)
- Predlog UI screen-ova"
```

**Korak 2: Migration**

```
Prompt: "Na osnovu dogovorenog dizajna, napiši Supabase migration.
Kreiraj u supabase/migrations/ sa timestamp prefixom."
```

**Korak 3: Types**

```
Prompt: "Regeneriši Supabase types (supabase gen types typescript --project-id xxx)
i pokaži mi diff."
```

**Korak 4: Server Actions**

```
Prompt: "Implementiraj Server Action createBudget. Prati template iz .cursorrules.
Uključi Zod validaciju i RLS test scenarij."
```

**Korak 5: UI**

```
Prompt: "Napravi stranicu /budzet sa listom budžeta. Prati patterns iz
/docs/03-design-system.md sekcija 4. Desktop + mobile oba."
```

**Korak 6: Testovi**

```
Prompt: "Dodaj Vitest testove za createBudget Server Action i Playwright E2E
test za budget create flow."
```

**Nikad ne skipuj korak 1.** Arhitektura prije koda. Inače gradis na pijesku.

---

## 10. Cheatsheet za česte operacije

### Novi Server Action

```
Prompt: "Kreiraj Server Action `xxx` u app/(app)/.../actions.ts koji radi Y.
Prati template iz .cursorrules."
```

### Nova shadcn komponenta

```
pnpm dlx shadcn@latest add <component>
```

### Novi test

```
Prompt: "Napiši Vitest test za <file>. Pokrij: success case, validation error,
auth error, edge cases za money math."
```

### Nova migration

```bash
supabase migration new add_xxx_to_yyy
# Pa prompt: "Popuni migration sa ALTER TABLE za dodavanje kolone Z..."
```

### Regeneration types

```bash
pnpm run supabase:types
# Alias u package.json: "supabase gen types typescript --project-id $PROJECT_ID > supabase/types.ts"
```

### Lint + format

```bash
pnpm lint
pnpm format
```

### Sve testove lokalno

```bash
pnpm test        # Vitest
pnpm test:e2e    # Playwright
```

---

## 11. Change Log

| Datum      | Verzija | Promjena           |
| ---------- | ------- | ------------------ |
| 2026-04-21 | 1.0     | Inicijalna verzija |
