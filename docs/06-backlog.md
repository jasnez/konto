# Konto — Backlog (Epics, Features, Tasks)

**Verzija:** 1.0 · **Datum:** april 2026.
**Status:** Živi dokument. Svaki završen task označi checkmarkom. Svaki task blokiran dokumentuj razlog.

---

## Kako čitati ovaj dokument

Backlog je organizovan u **5 faza**, svaka faza ima **Epike**, svaki Epic ima **Features**, svaki Feature ima **Taskove**.

**Taskovi su pisani kao Cursor prompt-ovi.** Svaki task možeš direktno kopirati u Cursor chat, plus referentne dokumente, i dobijaš izvediv rezultat.

**Legenda:**

- 🔒 Kritičan (ne može se skipovati)
- ⚡ Brz (< 30 min sa Cursor-om)
- 🐢 Spor (> 2h fokusiranog rada)
- 🧪 Zahtijeva test pokrivenost
- 🎨 Zahtijeva UX pregled
- 📚 Ažurira dokumentaciju

**Task referenca:** `[F1-E1-T3]` = Faza 1, Epic 1, Task 3.

---

## Trenutni status

- [ ] Faza 0 — Fondacija i setup
- [ ] Faza 1 — Manual MVP (samo ti)
- [ ] Faza 2 — PDF parser
- [ ] Faza 3 — Insights, budžeti, ciljevi
- [ ] Faza 4 — Beta korisnici

---

# FAZA 0 — Fondacija i setup

**Cilj:** repo sa funkcionalnim stackom, bez ijednog feature-a. Možeš da otvoriš `http://localhost:3000`, da se prijaviš magic linkom, i da vidiš prazan dashboard.

**Trajanje:** 2–3 sedmice · **Izlaz:** live app na `konto.vercel.app` sa auth flow-om

---

## Epic 0.1 — Repository & tooling setup

### [F0-E1-T1] 🔒 Kreiraj Next.js 15 projekt

**Kontekst:** Start from scratch. Sljedeći taskovi pretpostavljaju ovo kao osnovu.

**Reference:** `/docs/01-architecture.md` sekcija 3.3

**Prompt za Cursor:**

```
Napravi Next.js 15 projekt u tekućem folderu.

Zahtjevi:
- Next.js 15.x sa App Router
- TypeScript strict mode
- Tailwind CSS
- pnpm kao package manager
- ESLint + Prettier konfigurisani
- Folder struktura: app/, components/, lib/, public/, supabase/, __tests__/
- tsconfig.json sa path alias `@/*` → root
- .gitignore pokriva: .env*, .next, node_modules, .vercel, .supabase, coverage, *.log
- README.md sa basic info (naziv, pokretanje lokalno)
- package.json scripts: dev, build, start, lint, format, typecheck, test

Koristi `pnpm create next-app@latest` sa odgovarajućim flag-ovima. Nakon kreiranja:
- Dodaj ESLint pravila: @typescript-eslint strict, no-console warn (osim warn/error)
- Dodaj Prettier config: semi true, singleQuote true, printWidth 100, tabWidth 2

Završi tako da `pnpm dev` pokreće app na localhost:3000 i prikazuje default Next.js stranicu.
```

**Acceptance:**

- [ ] `pnpm dev` radi, localhost:3000 se otvara
- [ ] `pnpm build` bez errors/warnings
- [ ] `pnpm lint` bez errors
- [ ] `pnpm typecheck` bez errors

---

### [F0-E1-T2] 🔒 Setup `.cursorrules` fajla

**Kontekst:** Cursor treba konzistentan sistem prompt za sve buduće taskove.

**Reference:** `/docs/04-cursorrules.md` sekcija 2

**Prompt:** Nema prompta. Ti sam kopiraj sadržaj iz `docs/04-cursorrules.md` sekcija 2 u fajl `.cursorrules` u rootu projekta. Commit sa porukom `chore: add cursor rules`.

**Acceptance:**

- [ ] `.cursorrules` postoji u rootu
- [ ] Cursor u sljedećem prompt-u pokazuje da je pročitao pravila (test: pitaj "Koji je currency za default korisnika?" — treba reći BAM)

---

### [F0-E1-T3] ⚡ Instaliraj core dependencies

**Prompt:**

```
Instaliraj sljedeće pakete u Next.js projektu:

Production:
- @supabase/supabase-js
- @supabase/ssr
- zod
- react-hook-form
- @hookform/resolvers
- date-fns
- lucide-react
- sonner
- clsx
- tailwind-merge
- class-variance-authority

Dev:
- vitest
- @vitest/ui
- @vitejs/plugin-react
- @testing-library/react
- @testing-library/jest-dom
- @testing-library/user-event
- @playwright/test
- jsdom
- msw
- supabase (CLI)
- @types/node

Koristi `pnpm add` sa odgovarajućim flagovima.

Nakon instalacije:
- U `package.json` scripts dodaj: test (vitest), test:ui (vitest --ui), test:e2e (playwright test), supabase:types, supabase:start, supabase:stop
- Kreiraj `vitest.config.ts` i `vitest.setup.ts` prema specu iz /docs/05-testing.md sekcija 5
- Kreiraj `playwright.config.ts` prema specu iz /docs/05-testing.md sekcija 7.1

Kreiraj osnovni test `lib/utils.test.ts` koji testira neku trivijalnu funkciju (npr. `cn` helper) da verifikuješ da test setup radi.
```

**Acceptance:**

- [ ] Svi paketi instalirani bez vulnerabilities (`pnpm audit`)
- [ ] `pnpm test` pokreće vitest i prolazi
- [ ] `pnpm exec playwright install --with-deps chromium` uspješan

---

### [F0-E1-T4] ⚡ Setup shadcn/ui

**Prompt:**

```
Inicijalizuj shadcn/ui u ovom Next.js 15 projektu:

- `pnpm dlx shadcn@latest init` sa opcijama:
  - Style: Default
  - Base color: Neutral
  - CSS variables: Yes
  - Preferred location: components/ui

Dodaj sljedeće komponente (batch):
- button, card, input, label, textarea
- dialog, sheet, alert-dialog
- dropdown-menu, select, popover, command
- form, checkbox, switch, radio-group
- tabs, badge, separator, skeleton, toast
- avatar, alert, calendar

Ažuriraj `app/globals.css` sa design tokens iz /docs/03-design-system.md sekcija 2.1 (kompletan color system sa light + dark mode, CSS variables).

Ažuriraj `tailwind.config.ts` tako da uključuje:
- content paths za app/, components/, lib/
- extended colors koristeći CSS vars (income, expense, transfer)
- fontFamily: sans, mono sa CSS vars
- animation + keyframes iz tailwindcss-animate

Dodaj <Toaster /> (Sonner) u root layout.
Dodaj ThemeProvider sa system/dark/light preference (koristi next-themes).
Default theme: 'system'.

Verifikuj tako što ćeš privremeno dodati button na home page koji trigger-uje toast.
```

**Acceptance:**

- [ ] `components/ui/` postoji sa svim instaliranim komponentama
- [ ] Dark/light mode se prebacuje na osnovu OS settings-a
- [ ] Test toast klikom na dugme radi
- [ ] `cn()` utility postoji u `lib/utils.ts`

---

### [F0-E1-T5] ⚡ Setup fontova i base layout

**Prompt:**

```
Ažuriraj `app/layout.tsx`:

- Loaduj Inter (sans) i JetBrains Mono (mono) kroz next/font/google
- Subsets: latin, latin-ext (za bs/sr dijakritike)
- Variables: --font-sans, --font-mono
- Display: swap

Postavi HTML lang="bs" na <html> element.
Postavi metadata: title "Konto", description "Lična financije, lokalno i privatno."
Postavi suppressHydrationWarning na <html> (zbog theme).

Kreiraj `app/not-found.tsx` sa bosanskim copy-em: "Stranica nije pronađena. Vrati se na [početnu]."
Kreiraj `app/error.tsx` sa bosanskim copy-em: "Nešto nije u redu. [Pokušaj ponovo]."

Završi tako da pokretanjem `pnpm dev` vidimo lijepo renderovanu home stranicu sa našim fontovima.
```

**Acceptance:**

- [ ] Inter font se učitava
- [ ] Bosanska dijakritika (ć, č, š, đ, ž) se pravilno renderuje
- [ ] 404 i error page postoje i imaju bosanski copy

---

### [F0-E1-T6] 🔒 Git hooks i pre-commit checks

**Prompt:**

````
Setup Husky + lint-staged + gitleaks u projektu:

1. Instaliraj: `pnpm add -D husky lint-staged`
2. Inicijalizuj Husky: `pnpm exec husky init`
3. Kreiraj `.husky/pre-commit` sa:
```bash
pnpm exec lint-staged
pnpm typecheck
````

4. U `package.json` dodaj `lint-staged` config:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

5. Instaliraj gitleaks binarno (prema OS-u) i dodaj u pre-commit:

```bash
gitleaks protect --staged --verbose || exit 1
```

Testiraj: napravi probni commit koji sadrži fake API key string (npr. `SUPABASE_KEY=sk_live_123`) — hook treba da ga odbije. Potom uradi proper commit.

```

**Acceptance:**
- [ ] Pre-commit hook pokreće lint+format+typecheck
- [ ] Gitleaks hvata fake secret u test commitu
- [ ] Normalni commit prolazi

---

## Epic 0.2 — Supabase setup

### [F0-E2-T1] 🔒 Kreiraj Supabase projekt (EU)

**Kontekst:** Manual step — ovo ne radi Cursor.

**Koraci (ručno):**
1. Idi na https://supabase.com, napravi nalog (2FA obavezan).
2. Kreiraj novi projekt: `konto-dev`, region **Frankfurt (eu-central-1)**.
3. Zapiši Project URL i `anon` key + `service_role` key (služi se password manager-om).
4. U Dashboard → Auth → Providers: disable sve osim Email (magic link).
5. U Auth → URL Configuration: dodaj `http://localhost:3000/**` u Redirect URLs.
6. U Project Settings → API: zabilježi keys.
7. Instaliraj Supabase CLI: `brew install supabase/tap/supabase` (Mac) ili appropriate za OS.
8. `supabase login` i connect-uj sa projektom.

**Acceptance:**
- [ ] Supabase projekat "konto-dev" postoji u Frankfurt regionu
- [ ] CLI ulogovana, može `supabase projects list`

---

### [F0-E2-T2] 🔒 Setup Supabase CLI i local dev environment

**Prompt:**
```

U repo-u, setup Supabase lokalni development:

1. `supabase init` u repo-u (kreira supabase/ folder sa config.toml)
2. U `supabase/config.toml` postavi:
   - project_id = "konto-dev"
   - api.port = 54321
   - db.port = 54322
   - studio.port = 54323
3. Kreiraj `.env.local` fajl (NE commit-uj) sa:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<url iz Supabase dashboard>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```
4. Kreiraj `.env.example` sa istim varijablama ali bez vrijednosti — commit-uj.
5. Kreiraj `lib/supabase/server.ts` za Server Components/Actions:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — safe to ignore
          }
        },
      },
    },
  );
}
```

6. Kreiraj `lib/supabase/client.ts` za Client Components:

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

7. Kreiraj `lib/supabase/middleware.ts` za refresh tokena:

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes
  const protectedPaths = [
    '/pocetna',
    '/transakcije',
    '/racuni',
    '/budzet',
    '/ciljevi',
    '/uvidi',
    '/uvoz',
    '/podesavanja',
    '/kategorije',
  ];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/prijava';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

8. Kreiraj `middleware.ts` u root-u:

```typescript
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
};
```

Verifikuj: `pnpm dev` pokreće bez errors, middleware logi (console) pokazuju da se getUser() poziva.

```

**Acceptance:**
- [ ] `.env.local` postoji, `.env.example` commit-ovan
- [ ] 3 Supabase client fajla postoje
- [ ] Middleware funkcioniše — posjeta `/pocetna` bez auth redirectuje na `/prijava`

---

### [F0-E2-T3] 🔒 Prva migration: schema za Fazu 0

**Prompt:**
```

Kreiraj prvu Supabase migration koja kreira osnovnu schemu za Konto.

Komande:

1. `supabase migration new 00001_initial_schema`

Popuni generirani fajl sa SQL-om iz /docs/01-architecture.md sekcija 5.2, ali samo sljedeće tabele (ostale ćemo dodati u kasnijim migration-ama):

- extensions (uuid-ossp, pgcrypto, pg_trgm)
- trigger_set_updated_at function
- profiles + RLS + handle_new_user trigger
- accounts + RLS + update_account_balance trigger (iako je prazan za sada, kreiraj)
- categories + RLS
- transactions (kompletan, sa svim kolonama) + RLS + indeksi
- audit_log + RLS

Za sada NE kreiraj: merchants, merchant_aliases, import_batches, user_corrections, categorization_rules, budgets, goals, recurring_transactions, fx_rates, insights. Njih dodajemo u kasnijim fazama.

Dodaj na kraj migration-a SQL za seed sistemskih kategorija — ali zakomentarisan sa NAPOMENOM da će ići kroz Server Action handle_new_user trigger (ne možemo seed-ati sistemske kategorije bez user_id).

Umjesto toga, zamijeni `handle_new_user` trigger funkciju tako da pored inserta u profiles, pozove `insert_default_categories(user_id)` helper funkciju. Ta helper funkcija INSERT-uje sve default kategorije iz /docs/01-architecture.md sekcija 5.3.

Verifikuj lokalno:

- `supabase start`
- `supabase db reset` (primjenjuje migration)
- U Supabase Studio (localhost:54323) vidi tabele i provjeri RLS icon
- `supabase db diff` — da nema drift-a
- Pokušaj manual INSERT u tabelu accounts kao service_role — prolazi
- Pokušaj isti INSERT kao anon role — RLS blokira

Ažuriraj `package.json` scripts:

- "supabase:start": "supabase start"
- "supabase:reset": "supabase db reset"
- "supabase:types": "supabase gen types typescript --local > supabase/types.ts"

```

**Acceptance:**
- [ ] Migration kreirana u `supabase/migrations/`
- [ ] `supabase db reset` radi bez errors
- [ ] Kreiranje user-a u Auth automatski kreira profile + default categories
- [ ] RLS blokira cross-user pristup (test manually u Studio)
- [ ] `supabase gen types` radi, `supabase/types.ts` postoji

---

### [F0-E2-T4] ⚡ Generiši Supabase types

**Prompt:**
```

Pokreni `pnpm supabase:types` da generiše TypeScript types iz schema.

Kreiraj utility fajlove:

- `lib/supabase/types.ts` koji re-eksportuje types iz generated fajla sa lepšim imenima:

```typescript
import type { Database } from '@/supabase/types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Profile = Tables<'profiles'>;
export type Account = Tables<'accounts'>;
export type Category = Tables<'categories'>;
export type Transaction = Tables<'transactions'>;
```

Dodaj skriptu u package.json: "postinstall": "supabase gen types typescript --local > supabase/types.ts || true" (tako da se types regenerišu).

Verifikuj da TypeScript zna tipove:

- U bilo kom fajlu, `import type { Transaction } from '@/lib/supabase/types'` treba auto-complete kolone.

```

**Acceptance:**
- [ ] `supabase/types.ts` postoji i ima sve tabele
- [ ] `lib/supabase/types.ts` re-eksportuje named types
- [ ] IDE prepoznaje tipove

---

## Epic 0.3 — Auth flow

### [F0-E3-T1] 🔒 Landing + prijava stranica

**Reference:** `/docs/03-design-system.md` sekcija 4, sekcija 7

**Prompt:**
```

Kreiraj:

1. `app/(marketing)/page.tsx` — public landing

- Minimalna, focused na jednom message-u
- Header: logo "Konto" + dugme "Prijavi se"
- Hero: naslov "Novac, lokalno i privatno.", podnaslov "Lična financije koje žive na tvom kontu — bez povezivanja banke.", primarno dugme "Napravi nalog besplatno"
- Features grid: 3 kartice (Lokalno u EU, Bez povezivanja banke, Radi sa BAM/EUR)
- Footer: linkovi na privatnost, uslovi, kontakt
- Bosanski copy kroz i kroz

2. `app/(marketing)/layout.tsx` — layout sa header + footer

3. `app/(auth)/prijava/page.tsx` — magic link forma

- Centered card, max-w-sm
- Input polje: email (type=email, required, autoComplete=email)
- Submit button: "Pošalji link"
- Nakon submit-a: success stanje "Poslali smo ti link na [email]. Provjeri inbox."
- Error stanje: toast sa razlogom
- Loading stanje: spinner u dugmetu

4. `app/(auth)/layout.tsx` — minimalan layout (samo centered container)

5. `app/(auth)/prijava/actions.ts`:

```typescript
'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const SigninSchema = z.object({
  email: z.string().email(),
});

export async function sendMagicLink(input: unknown) {
  const parsed = SigninSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: 'VALIDATION_ERROR', details: parsed.error.flatten() };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error('signin_error', { error: error.message });
    return { success: false as const, error: 'EMAIL_SEND_FAILED' };
  }

  return { success: true as const };
}
```

6. `app/auth/callback/route.ts` — handler za magic link redirect:

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/pocetna';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/prijava?error=true`);
}
```

Sve stranice prate design system iz /docs/03-design-system.md.

```

**Acceptance:**
- [ ] `/` pokazuje landing
- [ ] `/prijava` ima funkcionalnu formu
- [ ] Submit šalje magic link (provjeri u inboxu)
- [ ] Klik na link redirectuje na `/pocetna`
- [ ] Neautentifikovan pristup `/pocetna` redirectuje na `/prijava`

---

### [F0-E3-T2] 🔒 Sign-out i profile osnova

**Prompt:**
```

Kreiraj:

1. Server Action `app/(app)/podesavanja/actions.ts`:

- `signOut()` — koristi supabase.auth.signOut(), redirect('/prijava')

2. `app/(app)/podesavanja/page.tsx`:

- Pokaži trenutni email + display_name (iz profiles)
- Input za display_name (može edit)
- Select za base_currency (BAM default, EUR, RSD, USD, MKD)
- Select za locale (bs-BA default, sr-RS-Latn, sr-RS-Cyrl, hr-HR, en-US)
- Action dugme "Odjavi se" (destructive variant)
- Sve forms koriste react-hook-form + Zod
- Submit zove Server Action updateProfile

3. Server Action updateProfile:

```typescript
'use server';
const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  base_currency: z.enum(['BAM', 'EUR', 'RSD', 'USD', 'GBP', 'CHF', 'MKD', 'HRK']).optional(),
  locale: z.enum(['bs-BA', 'sr-RS-Latn', 'sr-RS-Cyrl', 'hr-HR', 'mk-MK', 'en-US']).optional(),
});

export async function updateProfile(input: unknown) {
  const parsed = UpdateProfileSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: 'VALIDATION_ERROR', details: parsed.error.flatten() };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id);

  if (error) return { success: false, error: 'DATABASE_ERROR' };

  revalidatePath('/podesavanja');
  return { success: true };
}
```

Toast na uspjeh: "Sačuvano."
Toast na grešku: "Nije uspjelo. Pokušaj ponovo."

```

**Acceptance:**
- [ ] Možeš da mijenjaš display_name i vidiš promjenu na UI
- [ ] Odjava radi, redirect na /prijava
- [ ] Izmjena base_currency se spasi
- [ ] Svi inputi validirani (error inline)

---

### [F0-E3-T3] ⚡ App shell i navigacija

**Reference:** `/docs/03-design-system.md` sekcija 4.1

**Prompt:**
```

Kreiraj `app/(app)/layout.tsx` — app shell sa responsive navigation:

Desktop (md+):

- Sidebar (240px širok, collapsible na 64px)
- Top bar: page title + right-side actions slot
- Main content area

Mobile:

- Top bar: hamburger ili account switcher + logo + actions
- Bottom nav (fixed): Home, Transakcije, FAB (+), Uvidi, Više
- Safe area padding za iOS/Android

Nav items (Faza 0 — samo početna i podešavanja rade, ostali su placeholder):

- Home → /pocetna
- Transakcije → /transakcije
- - (FAB) → triggeruje quick-add modal (za sada samo empty dialog)
- Uvidi → /uvidi (placeholder)
- Više → /podesavanja i ostatak

Komponente:

- components/shell/sidebar.tsx
- components/shell/bottom-nav.tsx
- components/shell/top-bar.tsx
- components/shell/fab.tsx

Koristi Lucide icons (Home, Receipt, Plus, PieChart, Menu).
Aktivna route se detektuje sa usePathname() — highlight bold + primary color.

Kreiraj `app/(app)/pocetna/page.tsx` placeholder — "Dobrodošli, {display_name}! (Empty state za sada)".
Kreiraj `app/(app)/transakcije/page.tsx` placeholder.
Kreiraj `app/(app)/uvidi/page.tsx` placeholder.

Sva navigation koristi next/link (ne <a>).

```

**Acceptance:**
- [ ] Logirani korisnik vidi sidebar (desktop) ili bottom nav (mobile)
- [ ] Navigation između stranica radi
- [ ] Dark/light toggle negdje dostupan (u podešavanjima)
- [ ] FAB otvara prazan dijalog (klik radi)

---

## Epic 0.4 — Vercel deploy

### [F0-E4-T1] 🔒 Vercel projekat + deploy

**Manual koraci:**
1. Push repo na GitHub (private).
2. Na https://vercel.com kreiraj account (2FA obavezan).
3. Import GitHub repo → Vercel projekat `konto`.
4. Environment Variables u Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (Vercel će podesiti, ali postavi custom kasnije)
   - `SUPABASE_SERVICE_ROLE_KEY` (mark as encrypted)
5. Deploy grana `main`.
6. Nakon prvog deploy-a, uzmi Vercel URL (konto-xxx.vercel.app) i dodaj u Supabase Dashboard → Auth → URL Configuration → Redirect URLs.

**Acceptance:**
- [ ] App live na Vercel URL-u
- [ ] Sign-in radi sa live URL-a (magic link)
- [ ] Svi env vars set u Vercel
- [ ] Preview deploys rade za feature grane

---

# FAZA 1 — Manual MVP (samo ti)

**Cilj:** Ti možeš manualno dodati račune, transakcije, i vidjeti ih na dashboardu. Aplikacija je korisna samo za tebe, ali je korisna.

**Trajanje:** 3–4 sedmice · **Izlaz:** možeš da vodiš svoje finansije bez banke-connect-a

---

## Epic 1.1 — Accounts management

### [F1-E1-T1] 🔒🧪 Server Actions za accounts (CRUD)

**Reference:** `/docs/01-architecture.md` sekcija 6.2, `/docs/04-cursorrules.md` sekcija 2

**Prompt:**
```

Kreiraj `app/(app)/racuni/actions.ts` sa kompletnim CRUD-om za accounts tabelu.

Akcije:

1. `createAccount(input)` — prima: name, type, institution, currency, initial_balance_cents, icon, color
2. `updateAccount(id, input)` — parcijalni update
3. `deleteAccount(id)` — soft delete (set deleted_at)
4. `reorderAccounts(orderedIds)` — ažurira sort_order

Svaka akcija:

- Zod validation schema (colocated)
- Auth check via getUser()
- Za update/delete: eksplicitna ownership provjera
- revalidatePath('/racuni')
- Return standard shape

Schema za createAccount:

```typescript
const CreateAccountSchema = z.object({
  name: z.string().min(1, 'Naziv je obavezan').max(100),
  type: z.enum([
    'checking',
    'savings',
    'cash',
    'credit_card',
    'revolut',
    'wise',
    'investment',
    'loan',
    'other',
  ]),
  institution: z.string().max(100).optional().nullable(),
  currency: z.enum(['BAM', 'EUR', 'RSD', 'USD', 'GBP', 'CHF', 'MKD', 'HRK']),
  initial_balance_cents: z.bigint().default(0n),
  icon: z.string().max(10).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
});
```

NAPOMENA: bigint nije JSON-serializable. Rješenje: input.amount_cents stiže kao string, konvertuj sa `BigInt(amount_str)` u schema transform:

```typescript
amount_cents: z.string().transform((val) => BigInt(val));
```

Initial balance handling:

- Ako je initial_balance_cents != 0, kreiraj prvu "opening balance" transakciju u tom računu sa source='manual' i category 'opening_balance' (kreiraj tu sistemsku kategoriju u migraciji).
- Tako balance na accountu = sum transakcija, konzistentno.

Napiši unit testove u `app/(app)/racuni/actions.test.ts`:

- Success case
- Validation error
- Auth error
- Ownership check (user B ne može update-ovati A-ov account)

```

**Acceptance:**
- [ ] `pnpm test actions.test.ts` prolazi sve
- [ ] Manual test: kreiraj account kroz Supabase Studio, provjeri da radi
- [ ] Cross-user test manualno (otvori dva browsera sa različitim userima)

---

### [F1-E1-T2] 🎨 Stranica "Računi" (lista + forma)

**Reference:** `/docs/03-design-system.md` sekcija 4.3 (List template), sekcija 3.3 (komponente)

**Prompt:**
```

Kreiraj:

1. `app/(app)/racuni/page.tsx` (Server Component):

- Fetch accounts: supabase.from('accounts').select('\*').is('deleted_at', null).order('sort_order')
- Grid kartica (2 kolone desktop, 1 kolona mobile)
- Svaka kartica: icon + name + institution + balance (large) + currency + menu (edit/delete)
- Primary action u header-u: "Dodaj račun"
- Empty state: "Još nema računa. Dodaj prvi da počneš."

2. `app/(app)/racuni/novi/page.tsx`:

- Forma za kreiranje
- Polja: name (input), type (select sa predefinisanim opcijama i emoji), institution (combobox sa predefined BiH bankama), currency (select, BAM default), initial_balance (MoneyInput — **koristi placeholder komponentu za sada, pravićemo u T3**), icon picker, color picker
- Submit zove createAccount Server Action
- Na success: redirect na /racuni + toast
- Na error: inline error

3. `app/(app)/racuni/[id]/page.tsx`:

- Prikaz accounta + lista zadnjih 50 transakcija (placeholder dok nemamo tx)
- Menu: Edit, Delete (sa confirm dialog)

4. `app/(app)/racuni/[id]/uredi/page.tsx`:

- Ista forma kao novi, ali prepopulirana

5. Komponenta `components/account-card.tsx` — kartica u listi.

UI:

- Koristi shadcn Card, Button, Input, Select, Combobox (command)
- Bosanske rute (/racuni), bosanski copy
- Svi tekstovi iz Design System copy guide-a
- Touch targets min 44px na mobilnom

Bank combobox za BiH (pre-populated):
['Raiffeisen Bank d.d. BiH', 'UniCredit Bank d.d. BiH', 'Intesa Sanpaolo Banka BiH', 'NLB Banka BiH', 'Sparkasse Bank BiH', 'Nova banka', 'MF banka', 'ASA Banka', 'Addiko Bank BiH', 'ProCredit Bank', 'Union banka', 'Ziraat Bank', 'Privredna banka Sarajevo', 'Razvojna banka FBiH', 'Bosna Bank International']

Account type opcije (sa emoji):

- checking: 💳 Tekući račun
- savings: 🏦 Štedni račun
- cash: 💵 Gotovina
- credit_card: 💳 Kreditna kartica
- revolut: 🟣 Revolut
- wise: 🟢 Wise
- investment: 📈 Investicije
- loan: 🏠 Kredit
- other: 📦 Drugo

```

**Acceptance:**
- [ ] Možeš kreirati račun kroz UI
- [ ] Lista prikazuje račune, delete dialog radi
- [ ] Edit prepopulira formu i spasi promjene
- [ ] Balance se ažurira kad dodaš "opening balance"

---

### [F1-E1-T3] 🧪 MoneyInput komponenta (definitivna)

**Reference:** `/docs/03-design-system.md` sekcija 3.3.2, `/docs/01-architecture.md` sekcija 4.1

**Prompt:**
```

Kreiraj `components/money-input.tsx`:

Specifikacija:

- Controlled component: value: bigint (cents), onChange: (cents: bigint) => void
- Prop `currency: string` i opcioni `onCurrencyChange`
- Prop `allowNegative?: boolean` (default false)
- Prop `placeholder?: string` (default "0,00")
- Prop `disabled?: boolean`
- Prop `max?: bigint` (optional upper bound)
- Prop `size?: 'default' | 'lg'` — lg je za hero forme (veći font)

Interno state: raw string koji user tipka. Na blur se formatira sa thousands separator.

Parsing pravila (lib/format/parse-money.ts):

- Prihvata "1234" → 123400n (pretpostavljena 2 decimale)
- Prihvata "12,50" (bs-BA) → 1250n
- Prihvata "12.50" (en-US) → 1250n
- Prihvata "1.234,50" (bs-BA thousands) → 123450n
- Prihvata "-" ili "−" prefix za negativne
- Odbacuje sve ostalo (null return)

Formatiranje (lib/format/format-money.ts):

- formatMoney(1250n, 'BAM', 'bs-BA') → "12,50 KM"
- formatMoney(1250n, 'BAM', 'bs-BA', { showCurrency: false }) → "12,50"
- Koristi Intl.NumberFormat
- BAM se prikazuje kao "KM", ostale kao ISO kod

UI:

- Input sa klasama za tabular-nums i right-aligned text
- Currency pill desno (compact select ako onCurrencyChange postoji)
- Focus ring prema design tokens
- inputMode="decimal" za mobile brojčanu tastaturu

Testovi u `components/money-input.test.tsx`:

- Unos parsira u cents
- Blur formatira
- Negativne rade (ako allowNegative)
- Invalid input nije accepted
- Change currency ne mijenja value

Testovi u `lib/format/parse-money.test.ts`:

- Sve edge cases iz /docs/05-testing.md sekcija 6.1

Nakon što je komponenta gotova, ažuriraj forme iz T2 da koriste MoneyInput umjesto placeholder-a.

```

**Acceptance:**
- [ ] `pnpm test parse-money.test.ts` 100% prolazi
- [ ] Manual test: unesi "12,50" u MoneyInput — nakon blur prikazuje "12,50", value je 1250n
- [ ] Unesi "1234" → blur prikazuje "1.234,00"
- [ ] Currency switch radi i ne gubi value

---

## Epic 1.2 — Categories & merchants

### [F1-E2-T1] 🔒 Migration: merchants + merchant_aliases

**Prompt:**
```

Kreiraj migration `00002_merchants.sql`:

- Kreiraj tabelu `merchants` prema /docs/01-architecture.md sekcija 5.2 (samo ta tabela)
- Kreiraj tabelu `merchant_aliases` prema istom
- RLS policies za obje
- Indeksi (idx_merchants_user, idx_merchants_trgm, idx_aliases_merchant, idx_aliases_user)
- Trigger merchants_updated_at

Regeneriši types: `pnpm supabase:types`.

```

**Acceptance:**
- [ ] Migration prolazi `supabase db reset`
- [ ] Types generisani
- [ ] RLS manualno testiran

---

### [F1-E2-T2] 🎨 Stranica "Kategorije"

**Prompt:**
```

Kreiraj `app/(app)/kategorije/page.tsx`:

- Fetch kategorije grupisane po kind (expense, income, transfer)
- Tabs: "Troškovi", "Prihodi", "Transferi"
- Lista sa drag-and-drop za reorder (koristi @dnd-kit)
- Svaka stavka: icon + name + sort order + edit/delete menu
- Nije dozvoljeno brisati sistemske (`is_system=true`) — disable delete
- "Dodaj kategoriju" primary button (otvara modal)

Server Actions u `actions.ts`:

- createCategory(input)
- updateCategory(id, input)
- deleteCategory(id) — provjeriti da nije sistemska
- reorderCategories(orderedIds)

Schema:

```typescript
const CategorySchema = z.object({
  name: z.string().min(1).max(50),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Samo latinična slova, brojevi i crtica'),
  icon: z.string().max(10).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  kind: z.enum(['expense', 'income', 'transfer', 'saving', 'investment']),
  parent_id: z.string().uuid().optional().nullable(),
});
```

Automatski generiši slug iz name-a na blur name polja (koristi lib/format/slugify.ts — konvertuj bosanske dijakritike: čć→c, žš→zs, đ→dj).

UI fokus na mobile: lista sa 64px row visine, touch handle za drag-and-drop (samo na desktop edit mode), tap za edit u modalu.

```

**Acceptance:**
- [ ] Možeš edit-ovati sistemske kategorije (ime, icon, color) ali ne brisati
- [ ] Možeš dodati custom kategoriju
- [ ] Drag-and-drop reorder spašava
- [ ] Slug se auto-generiše iz name (ime "Opšte troškovi" → "opste-troskovi")

---

### [F1-E2-T3] 🧪 Stranica "Merchants" sa autocomplete

**Prompt:**
```

Kreiraj `app/(app)/merchants/page.tsx`:

Za Fazu 1 minimalno:

- Lista merchant-a (fetch iz merchants tabele)
- Svaki row: icon + canonical_name + default_category + transaction_count
- Dugme "Dodaj merchant"
- Edit otvara modal
- Delete s confirm

Server Actions:

- createMerchant({canonical_name, display_name, default_category_id, icon, color})
- updateMerchant
- deleteMerchant (samo ako transaction_count = 0, inače warn)

Potrebna pomoćna server akcija:

- searchMerchants(query: string, limit: number): MerchantResult[]
  - pg_trgm fuzzy match na canonical_name
  - ORDER BY similarity DESC, transaction_count DESC LIMIT limit
  - Koristićemo ovo u sljedećem tasku za autocomplete u quick-add

Unit test: searchMerchants vraća rezultate za tipične queries ("konz" → "Konzum", "hifa" → "Hifa-Oil"; ali ovdje testiraj sa seed mergjenjima).

```

**Acceptance:**
- [ ] CRUD radi
- [ ] `searchMerchants('konz', 5)` radi kad imaš merchant "Konzum"
- [ ] Transaction count se ažurira (posle tx insert-a — sljedeći Epic)

---

## Epic 1.3 — Transactions CRUD

### [F1-E3-T1] 🔒🧪 FX konverzija library

**Reference:** `/docs/01-architecture.md` sekcija 4.2, 4.3, `/docs/05-testing.md` sekcija 6.2

**Prompt:**
```

Kreiraj `lib/fx/` modul:

1. `lib/fx/constants.ts`:

```typescript
export const BAM_EUR_RATE = 1.95583;
export const EUR_BAM_RATE = 1 / BAM_EUR_RATE; // 0.51129...
```

2. `lib/fx/convert.ts`:

```typescript
export async function convertToBase(
  amountCents: bigint,
  fromCurrency: string,
  toCurrency: string,
  date: string, // ISO yyyy-mm-dd
): Promise<{
  baseCents: bigint;
  fxRate: number;
  fxRateDate: string;
  fxSource: 'identity' | 'currency_board' | 'ecb' | 'frankfurter' | 'stale';
  fxStale: boolean;
}>;
```

Logika:

- Ako fromCurrency == toCurrency → identity (rate 1, source 'identity')
- Ako par je BAM↔EUR → currency_board konstanta
- Ostalo: fetch kurs iz fx_rates tabele za taj datum (za sada tabela je prazna, vraća null)
- Ako nema u tabeli, pokušaj fetch iz Frankfurter API-ja: GET https://api.frankfurter.app/{date}?from=EUR&to={currency}
- Cache u fx_rates tabelu za sljedeći put
- Ako sve fail-uje, pokušaj zadnji poznati rate (MAX date < target date) i flag fxStale=true

NAPOMENA: za Fazu 1 fx_rates tabela nije u schemi — dodaj je sada u migration `00003_fx_rates.sql`:

- kreiraj fx_rates tabelu (vidi arch doc)
- RLS policy: select public
- Indeks idx_fx_quote_date

3. `lib/fx/convert.test.ts`:
   Sve testove iz /docs/05-testing.md sekcija 6.2.

Koristi `vi.mock` za Frankfurter fetch u testovima (ne treba live HTTP).

4. Kreiraj Edge Function za daily FX refresh (ne aktiviraj sada, samo scaffold):

- `supabase/functions/fx-refresh/index.ts` — za sada samo placeholder sa TODO.
- Registruj je u config.toml.

```

**Acceptance:**
- [ ] 100% test coverage na lib/fx/
- [ ] BAM→EUR i EUR→BAM konverzija rade bez API poziva
- [ ] BAM→USD ide kroz EUR (2 konverzije: BAM→EUR sa CB, EUR→USD sa API)
- [ ] Stale flag radi kad API fail-uje

---

### [F1-E3-T2] 🔒🧪 Transaction create Server Action

**Reference:** `/docs/01-architecture.md` sekcija 6.2 (cijeli template)

**Prompt:**
```

Kreiraj `app/(app)/transakcije/actions.ts` sa `createTransaction` akcijom.

Koristi template iz /docs/01-architecture.md sekcija 6.2 kao osnovu, ali dodaj:

- Dedup hash computation prije insert-a (koristi `lib/dedup.ts` koji ćemo kreirati):

```typescript
// lib/dedup.ts
import crypto from 'node:crypto';

export function computeDedupHash(input: {
  account_id: string;
  amount_cents: bigint;
  date: string;
  merchant: string | null;
}): string {
  const normalized = [
    input.account_id,
    input.amount_cents.toString(),
    input.date,
    (input.merchant ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

- Provjeri da li dedup_hash već postoji (zadnja 30 dana). Ako da, return `{success: false, error: 'DUPLICATE', duplicateId: existingId}` — UI odlučuje šta pitati usera.

- Auto-kategorizacija placeholder: za Fazu 1 samo koristi `category_id` iz input-a. U Fazi 2+ dodajemo kaskadu.

- Revalidate: `/transakcije`, `/racuni/[account_id]`, `/pocetna`.

Još dodaj:

- `updateTransaction(id, input)`
- `deleteTransaction(id)` — soft delete (set deleted_at)
- `restoreTransaction(id)` — za undo toast
- `bulkDeleteTransactions(ids)` — za bulk mode

Sve sa eksplicitnom ownership provjerom.

Unit testovi u `actions.test.ts`:

- create success
- create with validation error
- create unauthorized
- create with duplicate — vraća DUPLICATE code
- create cross-user account — vraća FORBIDDEN
- FX konverzija — BAM transakcija sa BAM base currency → base_cents == original_cents
- FX konverzija — EUR transakcija sa BAM base currency → base_cents = amount \* 1.95583
- delete sets deleted_at
- bulk delete prolazi 50+ u jednoj transakciji

```

**Acceptance:**
- [ ] Svi testovi prolaze
- [ ] Manual test: kreiraj transakciju kroz Supabase Studio → balance se update-uje (trigger radi)
- [ ] Duplicate detection radi

---

### [F1-E3-T3] 🎨 Quick-add transaction UI

**Reference:** `/docs/03-design-system.md` sekcija 3.3.3

**Prompt:**
```

Kreiraj `components/quick-add-transaction.tsx`:

Dialog (desktop) / Sheet (mobile) koji se triggeruje sa FAB-a ili keyboard shortcut `Cmd+K`.

Layout (mobile full-height sheet):

- Iznos MoneyInput (autofocus)
- Tip: tabs (Trošak, Prihod, Transfer) — mijenja sign i kategoriju dropdown
- Merchant — Combobox (shadcn Command) sa autocomplete iz searchMerchants
  - Na blur, ako merchant ne postoji u bazi, kreiraj ga in-place (prompt-uj ili auto)
- Kategorija — Select sa iconima iz kategorija te vrste
- Račun — Select (default: zadnji korišten)
- Datum — Calendar popover (default: danas)
- Notes — opciono Textarea (collapsed po defaultu)
- Submit "Spasi" — loading state
- Otkaži

Keyboard:

- Enter u amount polju → fokus merchant
- Enter u merchant polju → fokus kategorija
- Esc → close

Optimistic update:

- Odmah zatvori modal i pokaži toast "Transakcija je dodata."
- Ako Server Action fail-uje, pokaži error toast sa Retry dugmetom koji re-open-uje modal sa istim vrijednostima

Local storage "last used":

- Posle svake transakcije, zapamti: zadnji račun, zadnja kategorija, zadnji merchant
- Default iste vrijednosti u sljedećem otvaranju

Komponente:

- components/quick-add-transaction.tsx (main)
- components/merchant-combobox.tsx (sa searchMerchants hook)
- components/category-select.tsx (filter po kind)
- components/account-select.tsx
- components/date-picker.tsx (wrapper za shadcn Calendar u Popover)

Koristi React Hook Form + zodResolver.
Ista Zod schema kao Server Action — EXTRAKT u `lib/schemas/transaction.ts` da je dijelimo.

```

**Acceptance:**
- [ ] Otvaranje modal-a fokusira iznos polje
- [ ] Tab-iranje ide kroz polja logički
- [ ] Merchant autocomplete radi (search radi live)
- [ ] Submit kreira transakciju, modal se zatvara, toast se pojavi
- [ ] Greška pokaže toast sa retry
- [ ] Last-used memorisano i default u sljedećem

---

### [F1-E3-T4] 🎨 Stranica "Transakcije" (lista + filteri)

**Reference:** `/docs/03-design-system.md` sekcija 4.3, `/docs/01-architecture.md` sekcija 11 (performance)

**Prompt:**
```

Kreiraj `app/(app)/transakcije/page.tsx` (Server Component):

Query string filtriranje:

- ?account=<uuid>
- ?category=<uuid>
- ?from=<date>&to=<date>
- ?search=<text> — full-text na merchant_raw, description, notes
- ?page=<n> (default 1, page size 50)
- ?type=income|expense|transfer

Layout:

- Header: title + primary "+ Dodaj" button
- Sticky filter bar ispod header-a:
  - Date range picker (default: ovaj mjesec)
  - Multi-select za account
  - Multi-select za category
  - Search input (debounced 300ms)
  - Clear all filters link ako su aktivni
- Lista transakcija — koristi TransactionRow komponentu
- Paginacija na dnu

Komponenta `components/transaction-row.tsx` prema spec-u iz /docs/03-design-system.md sekcija 3.3.4.

Grupiraj po datumu: "Danas", "Juče", "Ova sedmica", "15. apr. 2026." itd. — day headers kao sticky sub-headers.

Empty state: "Još nema transakcija za ove filtere."

Mobile:

- Swipe left na row → quick actions (Edit, Delete)
- Long press → select mode (checkbox se pojavi; onda bulk-bar u footer-u: "3 odabrano · Obriši · Premjesti")
- Pull to refresh

Desktop:

- Hover row → akcije desno (Edit, Delete)
- Shift+Click za range select
- Cmd/Ctrl+Click za multi select

Performance:

- Server-side pagination (nikad fetch all)
- React.cache() na fetchTransactions da se ne poziva duplo
- Skeleton loading state
- `select` samo potrebne kolone, JOIN-uj category i merchant kroz Supabase foreign references

```

**Acceptance:**
- [ ] Lista prikazuje 50 transakcija page 1
- [ ] Filter po datumu radi, refreshuje listu
- [ ] Search debounced radi
- [ ] Desktop hover + akcije rade
- [ ] Mobile swipe radi (test na emulaciji)
- [ ] Sticky filter bar ne trza pri skrolu
- [ ] Lighthouse performance score ≥ 90

---

### [F1-E3-T5] 🎨 Detail stranica transakcije

**Prompt:**
```

Kreiraj `app/(app)/transakcije/[id]/page.tsx`:

Layout:

- Back button
- Hero: iznos (large) + date + merchant name
- Detalji:
  - Račun
  - Kategorija (sa inline edit — klik otvara dropdown)
  - Tagovi
  - Notes
  - Original iznos + valuta (ako različito od base)
  - FX rate (ako FX konverzija)
  - Source (manual, import, ...)
- Akcije:
  - Edit (otvara form)
  - Split (Faza 3+)
  - Mark as transfer
  - Delete
- Audit: kad kreirano, kad zadnji put editovano

Inline edit za kategoriju — bez otvaranja forme, samo dropdown sa save on change.

Related:

- "Sve transakcije sa ovim merchant-om" link (filter shortcut)

Edit stranica `[id]/uredi/page.tsx` — ista forma kao quick-add ali sa svim poljima expanded.

```

**Acceptance:**
- [ ] Vidis sve detalje transakcije
- [ ] Inline edit kategorije radi
- [ ] Delete otvara confirm dialog i briše
- [ ] Edit stranica prepopulira formu

---

## Epic 1.4 — Dashboard (početna)

### [F1-E4-T1] 🎨 Dashboard layout i hero

**Reference:** `/docs/03-design-system.md` sekcija 4.3 (Dashboard template)

**Prompt:**
```

Kreiraj/ažuriraj `app/(app)/pocetna/page.tsx`:

Layout (Server Component, uses Suspense boundaries):

1. Greeting banner:

- "Dobro jutro/dan/veče, {first_name}"
- (Opcioni) motivacioni text ako user tek počinje

2. Hero card: Ukupno stanje

- Sum svih accounts (current_balance_cents konvertovano u base_currency)
- Large amount display
- Badge: ±X% vs prošli mjesec
- Link: "Svi računi" → /racuni

3. Grid (2x2 desktop, 1x4 mobile):

- Kartica "Potrošeno ovaj mjesec" — sum expense transakcija ovog mjeseca
- Kartica "Prihodi ovaj mjesec"
- Kartica "Sačuvano" (prihod - trošak)
- Kartica "Prosječno dnevno" — moving avg last 30 days

4. Sekcija "Zadnje transakcije":

- 10 najnovijih
- Link "Vidi sve"

5. Sekcija "Trend" (Faza 3+): chart za sada placeholder

Data fetching:

- Paralelno kroz Promise.all
- Suspense sa skeleton za svaku sekciju

Komponente:

- components/dashboard/balance-hero.tsx
- components/dashboard/metric-card.tsx (reusable)
- components/dashboard/recent-transactions.tsx

Testiraj na mobile widths (360px) da nije zbijeno.

```

**Acceptance:**
- [ ] Hero se renderuje sa ukupnim balance-om
- [ ] Metric cards pokazuju ovaj mjesec
- [ ] Zadnje transakcije se vide
- [ ] Skeleton loading prije podataka
- [ ] Mobile izgleda kao single column

---

### [F1-E4-T2] 🧪 Utility: getSummary za dashboard

**Prompt:**
```

Kreiraj `lib/queries/summary.ts`:

```typescript
export async function getMonthlySummary(
  supabase: SupabaseClient,
  userId: string,
  baseCurrency: string,
  options: { year: number; month: number },
): Promise<{
  totalBalance: bigint;
  monthIncome: bigint;
  monthExpense: bigint;
  monthNet: bigint;
  prevMonthNet: bigint;
  netChangePercent: number;
  avgDailySpend: bigint;
}>;
```

Logika:

- totalBalance: SUM(current_balance_cents) iz accounts, konvertovano u base currency
- monthIncome: SUM(base_amount_cents) WHERE transaction_date u mjesecu AND kind='income' AND is_transfer=false AND is_excluded=false
- monthExpense: isto ali kind='expense' (apsolutna vrijednost)
- monthNet: income - expense
- prevMonth za comparison
- avgDailySpend: monthExpense / dayOfMonth (ili broj dana u mjesecu ako je prošli)

Performance:

- Jedan SQL query sa CTE-ovima (jedna DB runda)
- Koristi Supabase RPC funkciju za ovo (kreiraj u migration `00004_dashboard_rpc.sql`):

```sql
create or replace function public.get_monthly_summary(
  p_year int,
  p_month int,
  p_base_currency text
) returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  result jsonb;
begin
  -- ... SQL koji vraća JSON sa svim poljima
end;
$$;
```

Koristi stable (immutable within query) funkciju — tako PG može keš-irati plan.

Test u `lib/queries/summary.test.ts`:

- Sa seed podacima (3 accounta, 20 transakcija)
- Verifikuj totale
- Verifikuj exclude is_transfer i is_excluded
- Verifikuj kroz-valute (BAM + EUR računi, base = BAM)

```

**Acceptance:**
- [ ] RPC funkcija radi
- [ ] Testovi prolaze
- [ ] Dashboard koristi getMonthlySummary (ne direktne queries)

---

### [F1-E4-T3] ⚡ Keyboard shortcut Cmd+K za quick-add

**Prompt:**
```

Dodaj globalni keyboard shortcut za quick-add transakciju:

- Cmd+K (Mac) / Ctrl+K (Win/Linux) → otvara quick-add modal iz bilo gdje u app-u
- Esc → zatvara

Implementacija:

- Kreiraj hook `hooks/use-keyboard-shortcut.ts`:

```typescript
export function useKeyboardShortcut(
  combo: string,
  handler: () => void,
  options?: { preventDefault?: boolean; enabled?: boolean },
) {
  // useEffect that listens to window keydown
  // parses "mod+k" format where mod=meta on Mac, ctrl on others
}
```

- Plasiraj hook u `(app)/layout.tsx` da je globalno dostupan
- Trigger koji open-uje QuickAdd dialog (koristi Zustand store za global dialog state — `stores/ui.ts`)

Zustand store:

```typescript
// stores/ui.ts
import { create } from 'zustand';

type UiStore = {
  quickAddOpen: boolean;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  quickAddOpen: false,
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
}));
```

FAB i Sidebar "+Add" dugme oboje pozivaju openQuickAdd.

Prikaz shortcut hint-a: u FAB tooltip "Dodaj transakciju (⌘K)".

```

**Acceptance:**
- [ ] Cmd+K otvara modal iz home, transakcije, računi
- [ ] Tipkanje u input polja NE trigg-eruje shortcut
- [ ] Esc zatvara

---

## Epic 1.5 — Data export

### [F1-E5-T1] 🔒 Export podataka u JSON

**Reference:** `/docs/02-security-privacy.md` sekcija 6.2

**Prompt:**
```

Kreiraj `app/(app)/podesavanja/izvoz/page.tsx` i Server Action.

Stranica:

- Naslov "Izvezi sve tvoje podatke"
- Objasnjenje: "Dobićeš JSON fajl sa svim računima, transakcijama, kategorijama i merchants-ima. Koristi za backup ili migraciju."
- Dugme "Preuzmi export"
- Disclaimer: "Ovo može potrajati par sekundi."

Server Action `exportAllData()`:

1. Auth check
2. Fetch sve user-related data:
   - profiles (bez password/token polja — nema ih nego sigurnost provjeri)
   - accounts
   - categories
   - merchants
   - merchant_aliases
   - transactions (sa JOIN-ovanim imenima kategorija i merchanta za readability)
   - categorization_rules
   - budgets, goals, recurring (u Fazi 3 ako su popunjene)
3. Serialize u JSON — pazi na BigInt serialization (pretvori u string sa sufix "cents"):

```typescript
const replacer = (key: string, value: unknown) => {
  if (typeof value === 'bigint') return value.toString();
  return value;
};
```

4. Audit log event: 'export_data'
5. Return kao download

U UI, umjesto fetch kroz Server Action direktno (koji nije streamable), koristi Route Handler `/api/export/data`:

```typescript
// app/api/export/data/route.ts
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // fetch all + serialize
  const json = JSON.stringify(data, replacer, 2);

  // Log audit
  await supabase.from('audit_log').insert({ user_id: user.id, event_type: 'export_data' });

  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="konto-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
```

Rate limit: 1 export po satu (zapiši u audit_log, provjeri prije export-a).

```

**Acceptance:**
- [ ] Klik na dugme skine JSON fajl
- [ ] JSON ima sve korisnikove podatke
- [ ] BigInt se pravilno serialize-uje kao string
- [ ] Audit event upisan
- [ ] Drugi korisnik ne može export-ovati tvoje podatke

---

## Epic 1.6 — Account delete flow

### [F1-E6-T1] 🔒 Brisanje naloga (multi-step)

**Reference:** `/docs/02-security-privacy.md` sekcija 6.3

**Prompt:**
```

Implementiraj kompletan account delete flow:

1. `app/(app)/podesavanja/obrisi/page.tsx`:

- Warning title "Obriši svoj nalog"
- Lista šta će se obrisati (sve računi, transakcije, kategorije, budžeti, ciljevi)
- Napomena: "Nalog se soft-briše odmah. Nakon 30 dana se trajno briše."
- Input: "Unesi svoj email da potvrdiš" (mora match-ovati auth.users.email)
- Checkbox: "Razumijem da se ova akcija ne može poništiti"
- Dugme "Obriši nalog" (destructive)

2. Server Action `requestAccountDeletion(email)`:

- Auth check
- Provjeri da email match-uje
- Postavi profiles.deleted_at = now()
- Send email sa 24h cancelation link
- Audit log: 'account_deletion_requested'
- Sign out
- Return redirect na "/obrisan" informativnu stranicu

3. `app/obrisan/page.tsx` (public):

- "Tvoj nalog je označen za brisanje. Automatski će biti trajno obrisan za 30 dana."
- "Provjeri inbox za cancelation link ako si se predomislio."

4. Server Action `cancelDeletion(token)`:

- Decode token
- Provjeri exp
- profiles.deleted_at = NULL
- Sign in ponovo kroz magic link
- Redirect na /pocetna sa toast-om "Brisanje je otkazano."

5. Cron job `hard_delete_accounts` (pg_cron ili Supabase Edge Function):

- Dnevno provjeri profiles WHERE deleted_at < now() - interval '30 days'
- Za svaki, poziv supabase.auth.admin.deleteUser(id) koji CASCADE-uje kroz auth.users → sve tabele (zbog ON DELETE CASCADE)
- Audit log 'account_deleted' bez user_id (za retention)

U middleware, dodaj check: ako profiles.deleted_at != NULL, redirect na /obrisan.

Email template:
"Zdravo,

Zatražio si brisanje tvog Konto naloga. Za 30 dana će se podaci trajno obrisati.

Ako si se predomislio, klikni ovdje da otkažeš brisanje (link važi 24 sata):

[Otkaži brisanje]

Ako nisi ti zatražio, odmah klikni gore i javi nam.

Konto tim"

```

**Acceptance:**
- [ ] Request delete radi
- [ ] Nakon request-a, login redirectuje na /obrisan
- [ ] Cancelation link radi unutar 24h
- [ ] Hard delete cron job testiran manually (postavi deleted_at na past date, pokreni job)

---

## Epic 1.7 — Faza 1 QA i polish

### [F1-E7-T1] 🧪 E2E testovi za osnovne flow-ove

**Reference:** `/docs/05-testing.md` sekcija 7.2, 7.3

**Prompt:**
```

Napiši Playwright E2E testove u `__tests__/e2e/`:

1. `signin.spec.ts`:

- Landing → "Prijavi se" → unosi email → success message
- (Mock magic link klik kroz auth.admin API za test)

2. `add-transaction.spec.ts`:

- Ulogirati se kao test user
- Desktop: Cmd+K → modal → popuni → submit → vidi u listi
- Mobile: FAB → sheet → popuni → submit → vidi u listi

3. `accounts-crud.spec.ts`:

- Kreiraj račun → edit → delete → potvrdi removal

4. `export-delete.spec.ts`:

- Export → verifikuj download
- Request account deletion → verifikuj middleware redirect

5. Setup helpers `__tests__/e2e/helpers.ts`:

- signInAsTestUser (koristi service_role da kreira user i session)
- cleanupTestUser

Playwright config treba da može pokrenuti local Supabase (supabase start u webServer command).

Svi testovi trebaju proći u < 5 min ukupno.

```

**Acceptance:**
- [ ] `pnpm test:e2e` prolazi sve testove
- [ ] Testovi rade i u mobile projektu (iPhone 14 emulation)

---

### [F1-E7-T2] 📚 Ažuriraj dokumentaciju i README

**Prompt:**
```

Ažuriraj:

1. README.md u root-u:

- Project description (kratko)
- Tech stack bullet points
- Getting started (clone, pnpm install, supabase setup, .env.local, pnpm dev)
- Scripts reference
- Linkovi na dokumentaciju u /docs/

2. Dodaj `docs/runbooks/` folder sa:

- `runbooks/backup-restore.md` — kako uraditi backup i restore
- `runbooks/migration-guide.md` — kako dodati migration
- `runbooks/local-setup.md` — troubleshooting tipičnih setup problema

3. Ažuriraj `/docs/01-architecture.md` Change Log sa svim odlukama iz Faze 0–1.

4. Kreiraj `docs/decisions/` folder za Architecture Decision Records (ADRs):

- Template `0000-template.md`
- Prvi ADR `0001-next-supabase-stack.md` — zašto smo izabrali ovaj stack
- Drugi `0002-bigint-for-money.md` — zašto bigint
- Treći `0003-bosnian-routes.md` — zašto bosanske rute

```

**Acceptance:**
- [ ] README ima jasan onboarding tok
- [ ] ADR-i postoje i eksplicitno obrazlažu odluke
- [ ] Runbooks omogućavaju oporavak od tipičnih incident-a

---

### [F1-E7-T3] 🎨 Polish prolaz + mobile QA

**Prompt:**
```

Projdi kroz cijelu aplikaciju i popravi sitnice:

1. Mobile:

- Otvori na stvarnom telefonu (ne samo emulaciji)
- Provjeri sve forme — tastatura ne smeta
- Swipe i long-press rade prirodno
- Bottom nav ne se seče sa home bar-om

2. Dark mode:

- Prođi svaku stranicu u dark mode
- Provjeri contrast (axe DevTools)
- Nijedan element ne treba biti jedva vidljiv

3. Copy review:

- Svaki user-facing string prođi
- Konzistentno "ti", ne miješaj "Vi"
- Bosanski latinica uniformno
- Brojevi formatirani evropski
- Datumi u bs formatu

4. Performance:

- Lighthouse mobile test na /pocetna, /transakcije, /racuni
- Cilj: ≥ 90 Performance, 100 Accessibility
- Fix low-hanging fruit (unused imports, bez lazy loading heavy stuff)

5. Error states:

- Isključi internet, kliknin bilo gdje — pravilan error
- Stari session (sačekaj 7 dana) — redirect na sign-in gracefully

6. Empty states:

- Obriši sve transakcije → dashboard empty state
- Obriši sve račune → svi ekrani imaju empty state

7. 404:

- Posjeti /nepoznato → 404 page se renderuje

8. PWA basics (krajem Faze 1):

- Kreiraj `app/manifest.ts` ili `public/manifest.json`:

```json
{
  "name": "Konto",
  "short_name": "Konto",
  "description": "Lična financije.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0B",
  "theme_color": "#22C55E",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- Generiši ikone (192 i 512) — jednostavna "K" u zelenom kvadratu
- Dodaj apple-touch-icon
- Provjeri da "Add to home screen" radi na iOS Safari i Android Chrome

```

**Acceptance:**
- [ ] Lighthouse ≥ 90 na svim key stranicama
- [ ] PWA install radi
- [ ] Mobile QA checklist prošao
- [ ] Nema TODO-a u kodu koji su ostavljeni

---

# FAZA 2 — PDF Parser i automatizacija

**Cilj:** Korisnik upload-uje PDF izvod, sistem ga parsira pomoću LLM-a i kreira transakcije (s review korakom prije finalizacije). Mora raditi barem za: **Raiffeisen BiH**, **UniCredit BiH**, **Revolut**, **Wise**.

**Trajanje:** 4–6 sedmica · **Preduvjet:** Faza 1 završena, manualni unos radi.

**Referenca:** Vidi `01-architecture.md` sekciju 9 (PDF parsing pipeline) i `02-security-privacy.md` sekciju 5.3 (PDF retention + PII redakcija).

---

## Epic 2.1 — Storage i upload infrastruktura

### [F2-E1-T1] 🔒 Kreiraj Supabase Storage bucket za PDF-ove

**Kontekst:** Treba privatan bucket s striktnim RLS-om. PDF-ovi se brišu nakon 24h.

**Cursor prompt:**

```

U novoj Supabase migration fajli (`supabase/migrations/XXXXXXXXXXXX_pdf_storage.sql`):

1. Kreiraj privatan storage bucket "bank-statements":

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
'bank-statements',
'bank-statements',
false,
10485760, -- 10 MB
array['application/pdf']
);

2. RLS policies — user može samo u svoj folder (`userId/...`):

create policy "Users can upload own PDFs"
on storage.objects for insert to authenticated
with check (
bucket_id = 'bank-statements'
and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own PDFs"
on storage.objects for select to authenticated
using (
bucket_id = 'bank-statements'
and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own PDFs"
on storage.objects for delete to authenticated
using (
bucket_id = 'bank-statements'
and (storage.foldername(name))[1] = auth.uid()::text
);

3. Scheduled cleanup — pg_cron job koji svaki sat briše PDF-ove starije od 24h:

select cron.schedule(
'cleanup-old-statements',
'0 \* \* \* \*', -- svakih sat

$$
delete from storage.objects
where bucket_id = 'bank-statements'
  and created_at < now() - interval '24 hours';
$$

);

Napomena: pg_cron extension mora biti uključen u Supabase projektu (Database → Extensions).

Pokreni `supabase db push`. Provjeri u Supabase UI-ju da bucket postoji i da RLS policije važe.

```

**Acceptance:**
- [ ] Bucket `bank-statements` postoji, privatan
- [ ] RLS testovi: user A ne može čitati fajl user-a B (pokušaj iz različitog SQL konteksta)
- [ ] Cron job registrovan (`select * from cron.job;` ga pokazuje)
- [ ] Max file size 10 MB
- [ ] Samo `application/pdf` prihvaćen

---

### [F2-E1-T2] 🔒🧪 Upload Server Action s validacijom

**Kontekst:** Klijent šalje PDF, Server Action ga validira i sprema u Storage, kreira red u `import_batches`.

**Cursor prompt:**

```

Kreiraj `lib/server/actions/imports.ts` sa Server Actionom:

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UploadSchema = z.object({
accountId: z.string().uuid(),
file: z.instanceof(File)
.refine(f => f.size <= 10 _ 1024 _ 1024, "Fajl je veći od 10 MB")
.refine(f => f.type === "application/pdf", "Samo PDF je dozvoljen"),
});

export async function uploadStatement(formData: FormData) {
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Niste prijavljeni." };

const parsed = UploadSchema.safeParse({
accountId: formData.get("accountId"),
file: formData.get("file"),
});
if (!parsed.success) {
return { error: parsed.error.errors[0].message };
}

const { accountId, file } = parsed.data;

// Provjeri da account pripada useru
const { data: account } = await supabase
.from("accounts")
.select("id, user_id, bank_name")
.eq("id", accountId)
.eq("user_id", user.id)
.single();
if (!account) return { error: "Račun nije pronađen." };

// Checksum da se izbjegne duplo uploadovanje
const arrayBuffer = await file.arrayBuffer();
const hash = await crypto.subtle.digest("SHA-256", arrayBuffer);
const checksum = Array.from(new Uint8Array(hash))
.map(b => b.toString(16).padStart(2, "0"))
.join("");

const { data: existing } = await supabase
.from("import_batches")
.select("id")
.eq("user_id", user.id)
.eq("checksum", checksum)
.maybeSingle();
if (existing) {
return { error: "Ovaj izvod je već uploadovan.", batchId: existing.id };
}

// Upload u Storage
const path = `${user.id}/${crypto.randomUUID()}.pdf`;
const { error: uploadErr } = await supabase.storage
.from("bank-statements")
.upload(path, file, { contentType: "application/pdf" });
if (uploadErr) return { error: "Upload failed." };

// Kreiraj import_batch red
const { data: batch, error: insertErr } = await supabase
.from("import_batches")
.insert({
user_id: user.id,
account_id: accountId,
storage_path: path,
checksum,
status: "uploaded",
original_filename: file.name,
})
.select("id")
.single();
if (insertErr || !batch) {
// Cleanup storage ako insert fails
await supabase.storage.from("bank-statements").remove([path]);
return { error: "Database error." };
}

revalidatePath("/import");
return { batchId: batch.id };
}

Testovi u `lib/server/actions/__tests__/imports.test.ts`:

- Prihvata validan PDF
- Odbija fajl > 10 MB
- Odbija non-PDF MIME type
- Odbija ako account ne pripada useru
- Detektuje duplikat preko checksum-a
- Cleanup-uje Storage ako DB insert fails (mock scenario)

```

**Acceptance:**
- [ ] Server Action validira input s Zod-om
- [ ] Checksum detektuje duplikate
- [ ] Storage path format: `{userId}/{uuid}.pdf`
- [ ] Cleanup-uje Storage na greške
- [ ] Svi testovi prolaze

---

### [F2-E1-T3] 🎨 Upload UI s drag & drop

**Kontekst:** Stranica `/import` gdje korisnik uploaduje PDF. Mora raditi i na mobile-u.

**Cursor prompt:**

```

Kreiraj `app/(app)/import/page.tsx`:

- Zaglavlje: "Uvezi izvod"
- Dropdown za račun (lista user-ovih accounta)
- Drop zone (react-dropzone ili native):
  - Velika kartica s ikonom
  - "Prevuci PDF ovdje ili klikni da izabereš"
  - Na mobile-u: ogroman "Izaberi fajl" taster (min h-16)
  - Accepted: application/pdf
  - Max 10 MB
- Kada je fajl izabran: prikaži filename + size + dugme "Pošalji"
- Loading state tokom uploada (spinner + "Šaljem...")
- Error handling: toast s porukom

Klijent kod (upload):

- Koristi formaction ili client-side fetch sa Server Actionom
- Nakon uspjeha: redirect na `/import/[batchId]`

Mobile-first:

- Sve CTA dugmad min `h-12` (48px)
- Touch targets ≥ 44x44 px
- Drop zone na mobile ima "Izaberi iz galerije/fajlova" jasno odvojeno

Lista prethodnih importa (na istoj stranici, ispod):

- Tabela: Datum uploada, Banka, Status, # transakcija, Akcije (→ detalj)
- Status bedževi: uploaded (siva), parsing (žuta), ready (plava), imported (zelena), failed (crvena)
- Prazno stanje: "Još nisi uvezao niti jedan izvod. Prevuci PDF iznad."

Referiši dizajn obrasce iz `03-design-system.md`.

```

**Acceptance:**
- [ ] Drag & drop radi na desktopu
- [ ] File picker radi na mobile-u (iOS Safari + Chrome Android)
- [ ] Upload progress je vidljiv
- [ ] Lista prethodnih importa se renderuje
- [ ] Prazno stanje je prisutno
- [ ] Lighthouse Mobile ≥ 90

---

## Epic 2.2 — LLM parser (core intelligence)

### [F2-E2-T1] 🔒🧪 Ekstrakcija teksta iz PDF-a

**Kontekst:** Prije LLM-a, ekstraktujemo tekst iz PDF-a. Koristimo `pdf-parse` ili `pdfjs-dist` na serveru. Ako PDF nema ekstraktabilan tekst (slika-PDF), pada na OCR fallback.

**Cursor prompt:**

```

Instaliraj: pnpm add pdfjs-dist

Kreiraj `lib/parser/extract-text.ts`:

import \* as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractResult = {
text: string;
pageCount: number;
hasText: boolean; // false ako je slika-PDF
};

export async function extractPdfText(buffer: ArrayBuffer): Promise<ExtractResult> {
const pdf = await pdfjs.getDocument({ data: buffer }).promise;
const pageCount = pdf.numPages;
const pages: string[] = [];

for (let i = 1; i <= pageCount; i++) {
const page = await pdf.getPage(i);
const content = await page.getTextContent();
const pageText = content.items
.map((item: any) => ("str" in item ? item.str : ""))
.join(" ");
pages.push(pageText);
}

const fullText = pages.join("\n\n===PAGE_BREAK===\n\n");
const hasText = fullText.replace(/\s/g, "").length > 50;

return { text: fullText, pageCount, hasText };
}

Testovi u `lib/parser/__tests__/extract-text.test.ts`:

- Fixture: `tests/fixtures/pdfs/raiffeisen-sample.pdf` (anonimizirana verzija pravog izvoda)
- Fixture: `tests/fixtures/pdfs/image-only.pdf` (scanned)
- Test: tekstualni PDF ekstraktuje > 100 karaktera
- Test: image-only PDF ima hasText=false
- Test: pageCount je tačan

Napomena: Za testove koristi male fajlove (< 50 KB). Anonimiziraj prave podatke (zamijeni imena "Test Korisnik", iznose zadrži ili skaliraj).

```

**Acceptance:**
- [ ] `extractPdfText` vraća tekst i pageCount
- [ ] `hasText` je false za scanned PDF
- [ ] Testovi prolaze s fixtures
- [ ] Performanse: 5-stranicni PDF < 3 sekunde

---

### [F2-E2-T2] 🔒 PII redakcija prije slanja u LLM

**Kontekst:** Prije nego što tekst ode u Gemini, maskiramo brojeve računa (IBAN, PAN) i imena koja se ne tiču transakcija. Vidi `02-security-privacy.md` sekciju 5.3.

**Cursor prompt:**

```

Kreiraj `lib/parser/redact-pii.ts`:

export function redactPII(text: string): string {
let redacted = text;

// IBAN: BA39 1290... → BA**-REDACTED-**
redacted = redacted.replace(
/\b[A-Z]{2}\d{2}[\s\-]?(?:\d[\s\-]?){10,30}\b/g,
"[IBAN-REDACTED]"
);

// Kartice (PAN): 16 cifara (opciono sa razmacima ili crticama), Luhn check
redacted = redacted.replace(
/\b(?:\d[\s\-]?){13,19}\b/g,
(match) => {
const digits = match.replace(/\D/g, "");
if (isLuhnValid(digits)) {
return `****${digits.slice(-4)}`;
}
return match; // Ne maskiraj ako nije validan PAN
}
);

// JMBG (13 cifara): 1234567890123
redacted = redacted.replace(/\b\d{13}\b/g, (match) => {
// Ne maskiraj ako je dio većeg broja (npr. iznos)
return "[JMBG-REDACTED]";
});

return redacted;
}

function isLuhnValid(num: string): boolean {
let sum = 0;
let alt = false;
for (let i = num.length - 1; i >= 0; i--) {
let n = parseInt(num[i], 10);
if (alt) {
n \*= 2;
if (n > 9) n -= 9;
}
sum += n;
alt = !alt;
}
return sum % 10 === 0;
}

Testovi u `__tests__/redact-pii.test.ts`:

- IBAN "BA39 1290 0794 0102 8494" → redactovan
- PAN "4111 1111 1111 1111" → "\*\*\*\*1111"
- Non-Luhn 16 cifara → netaknuto
- JMBG 13 cifara → redactovan
- Običan tekst netaknut

```

**Acceptance:**
- [ ] IBAN-ovi se redactuju (BA, HR, SI, RS, ME, MK formati minimum)
- [ ] PAN se redactuje (zadnje 4 cifre ostaju)
- [ ] Luhn algoritam filtrira false positive
- [ ] Svi testovi prolaze

---

### [F2-E2-T3] 🔒🧪 LLM prompt i poziv (Gemini Flash-Lite)

**Kontekst:** Šaljemo redactovan tekst u Gemini 2.5 Flash-Lite. Model vraća strukturiran JSON s transakcijama.

**Cursor prompt:**

```

Instaliraj: pnpm add @google/generative-ai

Dodaj `GEMINI_API_KEY` u `.env.local` i u Vercel env. U `.env.example` dodaj placeholder.

Kreiraj `lib/parser/llm-parse.ts`:

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `
Ti si asistent koji ekstraktuje transakcije iz bankarskih izvoda.

Pravila:

1. Svaka transakcija MORA imati: datum (YYYY-MM-DD), iznos (negativan za odliv, pozitivan za priliv), valutu (ISO 4217), opis (raw text).
2. Koristi valutu navedenu u zaglavlju izvoda; ako nije eksplicitno, pretpostavi BAM za Bosnu i Hercegovinu.
3. Ignoriši: saldo linije, provizije zasebno (ako su u transakciji, ne izdvajaj), pregled stanja.
4. Iznose vrati kao broj u osnovnim jedinicama valute (pfenig, cent). Primjer: 125,50 BAM → 12550 (bigint-friendly).
5. Ako nisi siguran za transakciju, preskoči je (bolje manje nego pogrešno).
6. Vraćaj SAMO JSON, bez markdown oznaka.

Format odgovora:
{
"transactions": [
{
"date": "2026-04-15",
"amountMinor": -12550,
"currency": "BAM",
"description": "BINGO MARKET SARAJEVO",
"reference": "optional string"
}
],
"statementPeriodStart": "2026-04-01",
"statementPeriodEnd": "2026-04-30",
"confidence": "high" | "medium" | "low",
"warnings": ["..."]
}
`.trim();

export type ParsedTransaction = {
date: string; // ISO YYYY-MM-DD
amountMinor: number; // signed integer in minor units
currency: string;
description: string;
reference?: string;
};

export type ParseResult = {
transactions: ParsedTransaction[];
statementPeriodStart?: string;
statementPeriodEnd?: string;
confidence: "high" | "medium" | "low";
warnings: string[];
};

export async function parseStatementWithLLM(
redactedText: string,
bankHint?: string
): Promise<ParseResult> {
const model = genAI.getGenerativeModel({
model: "gemini-2.5-flash-lite",
systemInstruction: SYSTEM_PROMPT,
generationConfig: {
temperature: 0,
responseMimeType: "application/json",
// Schema-guided decoding za pouzdanost
responseSchema: {
type: SchemaType.OBJECT,
properties: {
transactions: {
type: SchemaType.ARRAY,
items: {
type: SchemaType.OBJECT,
properties: {
date: { type: SchemaType.STRING },
amountMinor: { type: SchemaType.INTEGER },
currency: { type: SchemaType.STRING },
description: { type: SchemaType.STRING },
reference: { type: SchemaType.STRING, nullable: true },
},
required: ["date", "amountMinor", "currency", "description"],
},
},
statementPeriodStart: { type: SchemaType.STRING, nullable: true },
statementPeriodEnd: { type: SchemaType.STRING, nullable: true },
confidence: { type: SchemaType.STRING },
warnings: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
},
required: ["transactions", "confidence", "warnings"],
},
},
});

const userMessage = bankHint
? `Banka: ${bankHint}\n\nIzvod:\n${redactedText}`
: `Izvod:\n${redactedText}`;

const result = await model.generateContent(userMessage);
const json = JSON.parse(result.response.text());
return json as ParseResult;
}

Testovi u `__tests__/llm-parse.test.ts`:

- Mock Gemini odgovor (nemoj zvati pravi API u testovima)
- Test: validira Zod schema nakon parsovanja
- Test: prazan izvod vraća transactions=[], confidence="low"
- E2E test (skip by default, manual only): poziva pravi API sa fixture PDF-om

VAŽNO: E2E test s pravim API-jem stavi pod `describe.skipIf(!process.env.RUN_LLM_TESTS)` da ne troši kredite na svakom CI run-u.

```

**Acceptance:**
- [ ] `GEMINI_API_KEY` konfigurisan u Vercel
- [ ] Schema-guided decoding uključen
- [ ] Unit testovi s mock-ovima prolaze
- [ ] E2E test opciono dostupan
- [ ] Latencija < 10s za 5-stranicni izvod

---

### [F2-E2-T4] 🔒🧪 OCR fallback (slika-PDF)

**Kontekst:** Ako PDF nema tekst, koristimo Mistral OCR API prije nego što šaljemo u Gemini.

**Cursor prompt:**

```

Kreiraj `lib/parser/ocr-fallback.ts`:

- Koristi Mistral OCR API (`mistral-ocr-2503` ili najnoviji model koji preporučuju)
- API key u `MISTRAL_API_KEY` env var
- Endpoint: https://api.mistral.ai/v1/ocr
- Input: base64 PDF
- Output: ekstraktovan tekst

export async function ocrFallback(pdfBuffer: ArrayBuffer): Promise<string> {
const base64 = Buffer.from(pdfBuffer).toString("base64");

const response = await fetch("https://api.mistral.ai/v1/ocr", {
method: "POST",
headers: {
"Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
"Content-Type": "application/json",
},
body: JSON.stringify({
model: "mistral-ocr-latest",
document: { type: "document_base64", document_base64: base64 },
}),
});

if (!response.ok) {
throw new Error(`OCR failed: ${response.status}`);
}

const data = await response.json();
return data.pages.map((p: any) => p.markdown).join("\n\n");
}

Integracija:
U `extractPdfText`, ako `hasText === false`, poziva se `ocrFallback`.

Budget guard:
OCR je skuplji od Gemini-ja. Dodaj check: ako user već ima X failed imports u 24h, blokiraj dalje da se izbjegne zloupotreba (Faza 4+, za sada trust).

Test: mock fetch i validiraj da se poziva samo za scanned PDF-ove.

```

**Acceptance:**
- [ ] OCR fallback radi za scanned PDF
- [ ] Ne zove se za tekstualne PDF-ove
- [ ] Greška iz Mistral API-ja se gracefully handle-uje
- [ ] Test mock-uje fetch

---

### [F2-E2-T5] 🔒🧪 Full parse pipeline (async job)

**Kontekst:** Sve prethodno (download → extract → redact → LLM) zajedno, kao async job koji se poziva iz upload Server Action-a. Koristi Supabase Edge Function ili Next.js background route.

**Cursor prompt:**

```

Pošto nemamo dedicated queue u Fazi 2, koristićemo Next.js Route Handler koji se poziva iz klijenta (after upload) ili serverless background function.

Pristup: Klijent, nakon uspješnog uploada, poziva `/api/imports/[batchId]/parse` endpoint (POST). Endpoint je `export const runtime = "nodejs"` i ima 60s timeout. Unutar, radi cijeli pipeline sinhronno.

Kreiraj `app/api/imports/[batchId]/parse/route.ts`:

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/parser/extract-text";
import { redactPII } from "@/lib/parser/redact-pii";
import { parseStatementWithLLM } from "@/lib/parser/llm-parse";
import { ocrFallback } from "@/lib/parser/ocr-fallback";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
req: NextRequest,
{ params }: { params: { batchId: string } }
) {
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

// Load batch (RLS će blokirati tuđe)
const { data: batch } = await supabase
.from("import_batches")
.select("id, account_id, storage_path, status, accounts(bank_name)")
.eq("id", params.batchId)
.single();
if (!batch) return NextResponse.json({ error: "not_found" }, { status: 404 });
if (batch.status !== "uploaded") {
return NextResponse.json({ error: "already_processed" }, { status: 409 });
}

// Označi kao "parsing"
await supabase.from("import_batches").update({ status: "parsing" }).eq("id", batch.id);

try {
// 1. Download PDF iz Storage
const { data: fileData } = await supabase.storage
.from("bank-statements")
.download(batch.storage_path);
if (!fileData) throw new Error("pdf_not_found");
const buffer = await fileData.arrayBuffer();

    // 2. Ekstraktuj tekst (OCR fallback ako treba)
    let { text, hasText } = await extractPdfText(buffer);
    if (!hasText) {
      text = await ocrFallback(buffer);
    }

    // 3. Redakcija
    const redacted = redactPII(text);

    // 4. LLM parse
    const parsed = await parseStatementWithLLM(
      redacted,
      batch.accounts?.bank_name
    );

    // 5. Snimi parsed transakcije u staging tabelu
    //    (parsed_transactions — privremeni red, čeka review od korisnika)
    const rows = parsed.transactions.map(t => ({
      batch_id: batch.id,
      user_id: user.id,
      date: t.date,
      amount_minor: t.amountMinor,
      currency: t.currency,
      raw_description: t.description,
      reference: t.reference,
      status: "pending_review",
    }));
    await supabase.from("parsed_transactions").insert(rows);

    // 6. Označi batch kao "ready"
    await supabase
      .from("import_batches")
      .update({
        status: "ready",
        transaction_count: parsed.transactions.length,
        parse_confidence: parsed.confidence,
        parse_warnings: parsed.warnings,
      })
      .eq("id", batch.id);

    return NextResponse.json({ success: true, count: parsed.transactions.length });

} catch (err) {
console.error("Parse error:", err);
await supabase
.from("import_batches")
.update({
status: "failed",
error_message: err instanceof Error ? err.message : "unknown",
})
.eq("id", batch.id);
return NextResponse.json({ error: "parse_failed" }, { status: 500 });
}
}

Dodaj migration za staging tabelu `parsed_transactions` (slična transactions ali sa batch_id i status="pending_review" | "accepted" | "rejected").

Testovi (integration):

- Mock LLM i OCR
- Kreiraj fiktivan batch
- Pozovi endpoint
- Assert da su redovi ubačeni u parsed_transactions
- Assert da je batch status promijenjen u "ready"
- Error case: LLM throw → batch status "failed", error_message set

```

**Acceptance:**
- [ ] Route radi sa runtime="nodejs", maxDuration=60
- [ ] Full pipeline: download → extract → redact → LLM → insert
- [ ] Failure stanje se pravilno snima
- [ ] parsed_transactions tabela ima sve potrebne kolone
- [ ] Integration testovi prolaze

---

### [F2-E2-T6] 🧪 Parser accuracy benchmark

**Kontekst:** Moramo mjeriti preciznost parsera. Kreiramo golden dataset anonimiziranih izvoda i poredimo output s ručno verifikovanim podacima.

**Cursor prompt:**

```

Kreiraj `tests/parser/golden/` folder sa strukturom:

tests/parser/golden/
├── raiffeisen-bih-01.pdf (anonimiziran)
├── raiffeisen-bih-01.expected.json (ručno validiran ground truth)
├── unicredit-bih-01.pdf
├── unicredit-bih-01.expected.json
├── revolut-01.pdf
├── revolut-01.expected.json
├── wise-01.pdf
├── wise-01.expected.json

Minimum 5 izvoda po banci (različiti mjeseci, različit volumen transakcija).

Kreiraj `tests/parser/benchmark.test.ts`:

- Za svaki golden izvod:
  1. Pokreni full pipeline
  2. Poredi output s expected.json
  3. Izračunaj:
     - Precision: (tačno parsovane) / (sve parsovane)
     - Recall: (tačno parsovane) / (sve očekivane)
     - F1 = 2PR / (P+R)
  4. Pass kriterij: F1 ≥ 0.90 po banci, ≥ 0.93 overall

- Tolerancija za iznose: exact match (bigint)
- Tolerancija za datume: exact match
- Tolerancija za opise: Levenshtein distance ≤ 10% dužine

Izvještaj (markdown) u `tests/parser/REPORT.md` — generisan skriptom, pokazuje accuracy per bank.

Ovi testovi idu pod tag @slow i pokreću se:

- Lokalno prije svake major promjene parsera
- Na CI samo na glavnoj grani (daily cron)
- Ne na svakom PR-u (skupi su)

```

**Acceptance:**
- [ ] ≥ 5 izvoda po banci u golden dataset-u
- [ ] Expected JSON ručno validiran
- [ ] Benchmark test mjeri precision/recall/F1
- [ ] Izvještaj se automatski generiše
- [ ] F1 ≥ 0.90 po banci

---

## Epic 2.3 — Review UI (ključni UX moment)

### [F2-E3-T1] 🎨 Stranica review-a parsiranih transakcija

**Kontekst:** Najvažniji ekran Faze 2. Korisnik vidi šta je LLM parsirao, popravlja greške, dodaje kategorije, i potvrđuje import.

**Cursor prompt:**

```

Kreiraj `app/(app)/import/[batchId]/page.tsx`:

Layout:

- Header: "Pregled uvoza" · Banka · Period izvoda · Confidence bedž
- Ako confidence="low": upozorenje "AI nije siguran. Pažljivo provjeri sve stavke."
- Sekcija "Warnings": lista upozorenja iz parse-a (ako postoje)

Glavna tabela transakcija (sortirane po datumu, najnovije prve):
Kolone:

- Checkbox (inicijalno svi označeni)
- Datum (editable inline)
- Opis (raw + autocomplete za merchant)
- Kategorija (Select iz user-ovih kategorija)
- Iznos (editable)
- Valuta (read-only, iz LLM-a)
- Akcije: × (isključi iz importa)

UX detalji:

- Prvi hit kategorizacije: auto-primjena ako postoji merchant alias match (vidi Epic 2.4)
- Red s confidence="low" je žuto-bordered
- Red s unknown merchant: placeholder u description polju "Novi merchant — dodaj"
- Bulk akcije: "Označi sve istom kategorijom" (multi-select mode)

Footer sticky bar:

- "X od Y označeno za import"
- Dugme "Potvrdi i importuj" (primary, veliki)
- Dugme "Odustani" (secondary) — vraća na /import, briše batch

Mobile pattern:

- Tabela postaje kartice
- Svaka kartica: Datum · Opis · Iznos (veliko) · Kategorija dropdown · Checkbox u gornjem uglu
- Sticky footer na dnu

Inline edit: koristi native `<input>` u ćeliji, onBlur trigger update preko Server Action-a (debounced).

```

**Acceptance:**
- [ ] Sve transakcije prikazane
- [ ] Inline edit radi za datum, opis, kategoriju, iznos
- [ ] Bulk kategorizacija radi
- [ ] Mobile layout je čitljiv
- [ ] Performance: 100+ redova bez lag-a

---

### [F2-E3-T2] 🔒🧪 Server Actions za accept/reject

**Cursor prompt:**

```

Kreiraj u `lib/server/actions/imports.ts`:

1. updateParsedTransaction(id, patch)
   - Ažurira jedan red u parsed_transactions
   - Validira amountMinor, datum, kategoriju (mora biti user-ova)
   - RLS osigurava vlasništvo

2. togglePartialExclusion(ids[], excluded: boolean)
   - Bulk update statusa za checkbox-ove

3. finalizeImport(batchId)
   - Transakcija (Postgres):
     1. Uzmi sve parsed_transactions sa status != "excluded" za taj batch
     2. Za svaku: izračunaj base_amount_minor (FX konverzija, koristi fx_rates ili fallback)
     3. Insert u transactions tabelu sa import_batch_id set
     4. Update batch status = "imported", imported_at = now()
     5. Obriši parsed_transactions za taj batch
   - Ako bilo šta padne, rollback
   - Obriši PDF iz Storage nakon finalize (24h pravilo — ali možemo odmah nakon imports)

4. rejectImport(batchId)
   - Obriši parsed_transactions
   - Obriši PDF iz Storage
   - Batch status = "rejected"

Testovi:

- finalizeImport kreira transactions
- FX se ispravno računa za ne-default valutu
- rejectImport briše PDF i parsed_transactions
- Svi su RLS-safe

```

**Acceptance:**
- [ ] Sva 4 Server Actiona implementirana
- [ ] Transakcija atomic (sve ili ništa)
- [ ] PDF obrisan nakon finalize i reject
- [ ] Testovi prolaze

---

### [F2-E3-T3] 🎨 Empty i error stanja

**Cursor prompt:**

```

Na review stranici:

Ako batch.status === "parsing":

- Prikaži animaciju "Parsiram izvod... (to traje 10-30 sekundi)"
- Poll svake 3 sekunde da vidiš da li je gotovo
- Timeout nakon 90s → "Parsiranje traje duže od očekivanog. Osvježi stranicu za par minuta."

Ako batch.status === "failed":

- Prikaži error poruku (user-friendly, ne tehnički stack trace)
- Dugmad:
  - "Pokušaj ponovo" (restart parse)
  - "Ručno unesi transakcije" (fallback, link na /transakcije/nova)
  - "Obriši import" (cleanup)

Ako je transactions.length === 0 (ready ali prazno):

- "AI nije pronašao transakcije u ovom izvodu."
- Dugmad: "Pokušaj ponovo s drugim PDF-om" ili "Ručno unesi transakcije"

Sve error poruke su na bosanskom, bez tehničkog žargona. Error mapping tabela:

- "parse_failed" → "Nismo uspjeli pročitati izvod. Da li je PDF iz banke?"
- "ocr_failed" → "PDF je skeniran i ne možemo ga pročitati automatski."
- "duplicate_batch" → "Ovaj izvod si već uvezao."

```

**Acceptance:**
- [ ] Sva 3 stanja ispravno renderovana
- [ ] Poll mehanizam radi
- [ ] Error poruke su jasne i na bosanskom
- [ ] Mobile-friendly

---

## Epic 2.4 — Auto-kategorizacija

### [F2-E4-T1] 🧪 Merchant aliases i kategorizacija kaskadom

**Kontekst:** Kad LLM izvuče description, želimo ga povezati s merchantom iz user-ovog rječnika ili globalnog seed-a, i automatski predložiti kategoriju. Vidi `01-architecture.md` sekciju 10 (kategorizacijska kaskada).

**Cursor prompt:**

```

Kreiraj `lib/categorization/cascade.ts`:

export type CategorizationInput = {
description: string;
userId: string;
amountMinor: number;
};

export type CategorizationResult = {
merchantId?: string;
categoryId?: string;
source: "rule" | "alias_exact" | "alias_fuzzy" | "history" | "llm" | "none";
confidence: number; // 0-1
};

Kaskada:

1. Explicit rule match (user's categorization_rules tabela)
   - WHERE pattern matches (regex ili LIKE)
   - Ako match, vrati s source="rule", confidence=1.0

2. Exact alias match
   - normalizuj description (lowercase, trim, remove specijalnih char)
   - SELECT iz merchant_aliases WHERE normalized = input
   - Ako match, vrati s source="alias_exact", confidence=1.0

3. Fuzzy alias match (Postgres trigram similarity)
   - SELECT merchant_id, similarity(alias, input) as score
   - FROM merchant_aliases
   - WHERE similarity > 0.6
   - ORDER BY score DESC LIMIT 1
   - Ako match > 0.75, vrati s source="alias_fuzzy", confidence=score

4. User history (user je već kategorisao nešto slično)
   - Pogledaj user-ove zadnje 1000 transakcija
   - Ako postoji sličan opis (trigram > 0.7), pozajmi kategoriju
   - source="history", confidence=0.6-0.8

5. LLM fallback (opciono u Fazi 2, može se odgoditi)
   - Pošalji opis + listu kategorija u Gemini
   - Vrati najvjerovatniju kategoriju
   - source="llm", confidence=0.5-0.7
   - Ograniči na transakcije > 50 KM (ne troši LLM na sitne)

6. None: vrati source="none", confidence=0

Testovi:

- Rule match → confidence=1
- Alias exact → confidence=1
- Fuzzy score > 0.75 → primjenjuje se
- Fuzzy score < 0.75 → pada dalje
- History fallback radi
- Prazan slučaj → source="none"

Napomena: Postgres pg_trgm extension mora biti uključen (`create extension if not exists pg_trgm;`).

```

**Acceptance:**
- [ ] Kaskada radi redoslijedom
- [ ] pg_trgm instaliran
- [ ] Svi slučajevi testirani
- [ ] Perf: < 100ms za jednu transakciju

---

### [F2-E4-T2] 🧪 Primjena kaskade na parsed_transactions nakon parse-a

**Cursor prompt:**

```

U `/api/imports/[batchId]/parse/route.ts`, nakon LLM parse-a (korak 4), a prije inserta u parsed_transactions:

for (const t of parsed.transactions) {
const categorization = await runCategorizationCascade({
description: t.description,
userId: user.id,
amountMinor: t.amountMinor,
});

t.merchant_id = categorization.merchantId;
t.category_id = categorization.categoryId;
t.categorization_source = categorization.source;
t.categorization_confidence = categorization.confidence;
}

// Zatim insert

Onda u review UI-ju:

- Ako categorization_source === "rule" ili "alias_exact" → zelena tačka "Auto"
- Ako === "alias_fuzzy" || "history" → žuta tačka "Provjeri"
- Ako === "llm" → narandžasta "AI predlog"
- Ako === "none" → crvena "Nije kategorisano"

Korisnik može override-ovati bilo šta.

```

**Acceptance:**
- [ ] Kaskada se poziva za svaku parsed transakciju
- [ ] Confidence vizualno prikazan
- [ ] Override radi

---

### [F2-E4-T3] 🧪 Learning loop — korekcije postaju aliasi

**Kontekst:** Kad korisnik override-uje AI-jevu kategorizaciju, sistem uči. Iduće tako slično → auto-primjena.

**Cursor prompt:**

```

U `updateParsedTransaction` Server Action-u, kad se kategorija promijeni:

- Ako je original categorization_source !== "rule" && !== "alias_exact":
  - Zabilježi u `user_corrections` tabeli (vidi 01-architecture.md)
  - Ako user 3+ puta kategorizovao istu (normalizovanu) descriptionu u istu kategoriju:
    - Auto-kreiraj merchant_alias za tog usera sa category_id
    - Notify u UI: "Naučio sam — sljedeći put ću ovo automatski kategorisati."

Implementiraj:

- `lib/categorization/learn.ts`:
  - recordCorrection(userId, originalDescription, newCategoryId)
  - maybeCreateAlias(userId, description, categoryId) — provjera 3+ puta

Testovi:

- Jedna korekcija → ne kreira alias
- 3 korekcije iste desc + kategorije → kreira alias
- 3 korekcije različitih kategorija → NE kreira alias (dvosmisleno)

```

**Acceptance:**
- [ ] Korekcije se bilježe
- [ ] 3+ puta pravilo radi
- [ ] Notify se prikazuje korisniku
- [ ] Testovi prolaze

---

## Epic 2.5 — Dedup i sigurnost

### [F2-E5-T1] 🧪 Duplicate detection pri importu

**Kontekst:** Ako user uveze dva preklapajuća izvoda, ne smijemo duplirati transakcije.

**Cursor prompt:**

```

U finalizeImport:

Prije nego što insert-uješ u transactions, za svaku:

- Check da li postoji transakcija sa:
  - isti account_id
  - isti datum (±1 dan tolerance)
  - isti amount_minor
  - sličan opis (trigram > 0.8)

Ako da:

- Preskoči insert
- Zabilježi u batch.dedup_skipped counter

Na kraju, u notifikaciji ili success stranici:
"Importovano 42 transakcije. 3 preskočene kao duplikati."

Testovi:

- 2 identične transakcije → druga preskočena
- Različit datum → nije duplikat
- Različit iznos → nije duplikat
- Sličan ali ne isti opis (npr. "BINGO" vs "BINGO MARKET") → mjeri trigram

```

**Acceptance:**
- [ ] Dedup check radi
- [ ] Counter pravilan
- [ ] Notifikacija jasna

---

### [F2-E5-T2] 🔒 Rate limiting na import endpoint

**Cursor prompt:**

```

Dodaj rate limit na `/api/imports/[batchId]/parse`:

- Max 5 parse poziva po user-u u 10 minuta
- Max 20 uploada po user-u dnevno

Implementacija: Upstash Redis ili Supabase rate_limits tabela (jednostavnija).

Kreiraj tabelu:
create table rate_limits (
id uuid primary key default gen_random_uuid(),
user_id uuid references auth.users,
action text not null, -- "parse" | "upload"
created_at timestamptz default now()
);
create index on rate_limits(user_id, action, created_at);

Helper:
export async function checkRateLimit(
userId: string,
action: string,
limit: number,
windowSec: number
): Promise<boolean> {
const { count } = await supabase
.from("rate_limits")
.select("_", { count: "exact", head: true })
.eq("user_id", userId)
.eq("action", action)
.gt("created_at", new Date(Date.now() - windowSec _ 1000).toISOString());

if (count >= limit) return false;

await supabase.from("rate_limits").insert({ user_id: userId, action });
return true;
}

Cleanup: pg_cron briše stare unose (> 24h) svaki sat.

```

**Acceptance:**
- [ ] Rate limit postavljen
- [ ] Vraća 429 kada se prekorači
- [ ] Cleanup radi

---

## Epic 2.6 — Završna Faza 2 QA

### [F2-E6-T1] 🧪 E2E test za cijeli import flow

**Cursor prompt:**

```

Playwright test:

1. Signin
2. Idi na /import
3. Izaberi account
4. Upload fixture PDF (raiffeisen-sample.pdf)
5. Čekaj na redirect na /import/[batchId]
6. Čekaj dok status ne bude "ready" (max 90s)
7. Assert tabela ima > 0 transakcija
8. Edit jednu: promijeni kategoriju
9. Isključi jednu (uncheck)
10. Klikni "Potvrdi i importuj"
11. Assert redirect na /transakcije
12. Assert nova transakcija postoji
13. Cleanup: delete test batch

Fixture:

- Koristi jedan od golden dataset PDF-ova
- Mock LLM? U CI-ju DA (deterministički response), lokalno može pravi

Markiraj kao @slow, pokreni samo na main branch.

```

**Acceptance:**
- [ ] E2E flow prolazi
- [ ] Mock LLM radi za CI
- [ ] Cleanup nakon testa

---

### [F2-E6-T2] 📚 Ažuriraj dokumentaciju i User-facing help

**Cursor prompt:**

```

1. U /sigurnost stranicu dodaj sekciju:
   "Uvoz PDF izvoda"
   - Kako obrađujemo tvoj PDF
   - Šta je redactovano prije slanja u AI
   - Koliko dugo čuvamo PDF (24h)
   - Koji AI koristimo (Gemini 2.5 Flash-Lite, EU processing)

2. U /import stranicu dodaj tooltip/help link:
   - "Kako funkcioniše uvoz?"
   - Link na Help/FAQ

3. Kreiraj `/help` stranicu (osnovno, Faza 2):
   - FAQ sekcije
   - "Izvod se ne parsira — šta raditi?"
   - "Koje banke podržavamo?"
   - "Kako se učiti kategorije?"

4. README.md u repo-u: dodaj sekciju "Faza 2 features"

```

**Acceptance:**
- [ ] /sigurnost ažurirana
- [ ] /help stranica postoji
- [ ] README ažuriran


---

# FAZA 3 — Insights i financijska inteligencija

**Cilj:** Konto postaje koristan — budžeti, pretplate, forecasting, ciljevi. Korisnik vidi **uvide** koje ne može dobiti ručnim spreadsheet-om.

**Trajanje:** 3–4 sedmice · **Preduvjet:** Faza 2 završena, imamo podatke za analizu.

---

## Epic 3.1 — Budžeti

### [F3-E1-T1] 🔒🧪 Migration i model za budgets

**Cursor prompt:**

```

Migration `XXXX_budgets.sql`:

create table budgets (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references auth.users on delete cascade,
category_id uuid not null references categories on delete cascade,
amount_minor bigint not null check (amount_minor > 0),
currency text not null default 'BAM',
period text not null check (period in ('monthly', 'weekly')),
active boolean not null default true,
created_at timestamptz default now(),
updated_at timestamptz default now(),
unique (user_id, category_id, period)
);

create index on budgets(user_id, active);

-- RLS
alter table budgets enable row level security;

create policy "Users manage own budgets"
on budgets for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Trigger za updated_at (koristi postojeći tg funkcija iz 01-architecture)

Testovi:

- User ne može kreirati budžet za tuđu kategoriju
- Unique constraint na (user, category, period)
- Negative amount se odbija

```

**Acceptance:**
- [ ] Migration pokreće se
- [ ] RLS radi
- [ ] Testovi prolaze

---

### [F3-E1-T2] 🔒🧪 Server Actions za budgets

**Cursor prompt:**

```

`lib/server/actions/budgets.ts`:

- createBudget({ categoryId, amount, currency, period })
- updateBudget(id, patch)
- deleteBudget(id)
- toggleActive(id, active)

Validacija:

- Zod schema
- amount u BAM se konvertuje u minor units (bigint)
- categoryId mora biti user-ov

Helper: getCurrentPeriodSpent(userId, budgetId): bigint

- Sumira transakcije u toj kategoriji za tekući period (mjesec ili sedmica)
- Koristi base_amount_minor (jer budžet je u BAM, transakcije mogu biti u drugoj valuti)

Testovi: sve CRUD operacije + RLS.

```

---

### [F3-E1-T3] 🎨 Stranica "Budžeti"

**Cursor prompt:**

```

`app/(app)/budzeti/page.tsx`:

Layout:

- Header: "Budžeti" · CTA "Novi budžet"
- Grid kartica: jedna po budžetu
  - Naziv kategorije + ikona
  - Progress bar: potrošeno / limit
  - Boja progress bar-a:
    - Zelena: < 70%
    - Žuta: 70-95%
    - Crvena: > 95%
  - Tekst: "250 KM od 500 KM · 10 dana do kraja mjeseca"
  - Hover/tap: dropdown s akcijama (Edit, Deaktiviraj, Obriši)
- Ako nema budžeta: empty state s CTA "Postavi prvi budžet"

Modal/drawer "Novi budžet":

- Select kategorija (samo one koje još nemaju budžet za period)
- Input iznos
- Select period (mjesečno/sedmično)
- Preview: "Prošli mjesec si potrošio 312 KM u ovoj kategoriji"

Mobile: lista umjesto grida, svaka stavka full-width kartica.

```

---

### [F3-E1-T4] 🧪 Dashboard widget "Budžeti ovog mjeseca"

**Cursor prompt:**

```

Na home dashboardu, dodaj widget:

- Top 3 najbliža prekoračenju (sortirani po % iskorištenosti)
- Link "Vidi sve budžete" → /budzeti

Ako user nema budžete: suggest card "Postavi prvi budžet" s CTA.

Koristi cached RPC funkciju za sumiranje (vidi 01-architecture sekciju 12).

```

---

## Epic 3.2 — Recurring / pretplate

### [F3-E2-T1] 🧪 Detekcija recurring transakcija

**Kontekst:** Algoritam koji nađe ponavljajuće transakcije (Netflix, struja, kirija) i predloži ih kao "pretplate".

**Cursor prompt:**

```

Kreiraj `lib/analytics/recurring-detection.ts`:

export async function detectRecurring(userId: string): Promise<RecurringCandidate[]> {
// 1. Uzmi sve user-ove transakcije zadnjih 6 mjeseci
// 2. Grupiraj po (merchant_id ili normalized description)
// 3. Za svaku grupu gdje ima ≥ 3 transakcije:
// - Izračunaj intervale između datuma (dani)
// - Ako je std dev intervala < 30% srednje vrijednosti → recurring
// - Klasifikuj period:
// - Srednji interval 27-33 dana → "monthly"
// - 13-15 dana → "bi-weekly"
// - 6-8 dana → "weekly"
// - 85-95 dana → "quarterly"
// - 360-370 → "yearly"
// - Izračunaj prosječan iznos (median robusnost)
// - Vrati: merchant_name, period, average_amount, last_seen, next_expected
}

export type RecurringCandidate = {
merchantId?: string;
description: string;
period: "weekly" | "bi-weekly" | "monthly" | "quarterly" | "yearly";
averageAmountMinor: number;
currency: string;
lastSeen: string;
nextExpected: string;
confidence: number; // 0-1
occurrences: number;
};

Testovi:

- 6 mjesečnih transakcija istog iznosa → detected monthly
- 3 transakcije različitih datuma → confidence nizak
- Jedna transakcija → nije recurring

```

---

### [F3-E2-T2] 🧪 Migration i Server Actions za recurring_transactions

**Cursor prompt:**

```

(Tabela već definisana u 01-architecture.md sekciji 7.)

Server Actions:

- detectAndSuggest() — pokrene algoritam, vrati kandidate
- confirmRecurring(candidate) — user potvrdi, snima se u tabelu
- editRecurring(id, patch)
- cancelRecurring(id) — označi kao inactive
- bindToTransaction(recurringId, transactionId) — veže postojeću transakciju

Automatski trigger: svaki put kad se importuje batch, pokreni detectAndSuggest za usera. Ako nađe novih kandidata (koji nisu već u recurring_transactions), dodaj notification.

```

---

### [F3-E2-T3] 🎨 Stranica "Pretplate"

**Cursor prompt:**

```

`app/(app)/pretplate/page.tsx`:

Sekcije:

1. Aktivne pretplate (potvrđene)
   - Lista kartica: ime · period · sljedeći datum · iznos
   - Mjesečni ekvivalent: sve pretplate preračunate na mjesečni nivo (yearly / 12, itd.)
   - Grand total: "Mjesečno trošiš X KM na pretplate"
2. Predložene pretplate (iz detekcije)
   - Kartica s CTA "Potvrdi kao pretplatu" ili "Ignoriši"
3. Historija "Ukinuto"

Detalj pretplate (drawer):

- Graf: iznosi kroz vrijeme
- Lista transakcija vezanih za ovu pretplatu
- Next expected date
- Akcije: Edit, Pauziraj, Otkaži

Insighti na vrhu:

- "Nađoš si 3 pretplate koje nisi otkazao a ne koristiš?" (na osnovu frekvencije upotrebe — ostavi za kasnije, suggestion only)

```

---

## Epic 3.3 — Forecasting (cashflow projekcija)

### [F3-E3-T1] 🧪 Algoritam projekcije naredna 30/60/90 dana

**Cursor prompt:**

```

`lib/analytics/forecast.ts`:

export async function forecastCashflow(
userId: string,
daysAhead: number
): Promise<ForecastResult> {
// 1. Start balance = trenutni saldo svih accountsa (u BAM)
// 2. Predict odliva:
// - Za svaku recurring_transaction: next_expected u periodu → minus amount
// - Prosjek dnevne potrošnje (zadnjih 90 dana) kao baseline za ne-recurring
// 3. Predict priliva:
// - Recurring plus (plata)
// - Prosjek dnevnog priliva (vjerovatno samo plata)
// 4. Vrati day-by-day projekciju: array of {date, balance, events}

// Algoritam je jednostavan — ne ML. U Fazi 5 može se zamijeniti.
}

export type ForecastResult = {
currentBalance: number; // minor units BAM
projections: Array<{
date: string;
balance: number;
inflow: number;
outflow: number;
events: Array<{ type: "recurring" | "baseline"; description: string; amount: number }>;
}>;
lowestPoint: { date: string; balance: number };
runway: number | null; // dana do negativnog salda, ili null ako nikad
};

Testovi:

- User sa stable plate + recurring pretplatama → runway = null (neće propasti)
- User sa deficitom → runway vraća tačan broj dana

```

---

### [F3-E3-T2] 🎨 Dashboard widget "Projekcija"

**Cursor prompt:**

```

Na dashboardu dodaj novi widget:

- Line chart: balance u narednih 30 dana (recharts ili chart.js)
- Pokaži trenutni balance kao polaznu tačku
- Označi "events" na grafu (pretplate itd.) kao dots
- Ako postoji lowest point < 0: warning stripe u crveno, "Upozorenje: očekuje se negativan saldo X datuma"
- Ako je runway definisan: "Novac će istrajati sljedećih X dana bez novih priliva"

Mobile: jednostavan chart, scroll horizontalno ako treba.

```

---

## Epic 3.4 — Ciljevi štednje

### [F3-E4-T1] 🔒🧪 Migration i model

**Cursor prompt:**

```

Migration `XXXX_goals.sql`:

create table goals (
id uuid primary key default gen_random_uuid(),
user_id uuid not null references auth.users on delete cascade,
name text not null check (length(name) between 1 and 200),
target_amount_minor bigint not null check (target_amount_minor > 0),
currency text not null default 'BAM',
target_date date, -- nullable
current_amount_minor bigint default 0 check (current_amount_minor >= 0),
account_id uuid references accounts, -- optional, ako je cilj vezan za specifičan štedni račun
icon text,
color text,
active boolean default true,
achieved_at timestamptz,
created_at timestamptz default now()
);

RLS policies (identično kao budgets).

Trigger: kad current_amount_minor >= target → set achieved_at = now(), aktiviraj notifikaciju.

```

---

### [F3-E4-T2] 🎨 Stranica "Ciljevi" s vizuelnim progress-om

**Cursor prompt:**

```

`app/(app)/ciljevi/page.tsx`:

- Grid kartica po cilju:
  - Ime + emoji/ikona
  - Veliki progress krug (conic-gradient ili SVG circle)
  - Tekst: "350 KM od 1000 KM · 65% do 31.12.2026."
  - Preostalo vrijeme: "8 mjeseci"
  - Preporučeni mjesečni doprinos: (target - current) / remaining_months
  - Akcije: "Dodaj uplatu" (manualni entry), Edit, Obriši

Ako cilj vezan za account: automatski računaj current = account.current_balance (minus debts ako ima).

Celebrate modal kad se postigne cilj: konfeti animacija, "Čestitam! Dostigao si cilj: 'Ljetovanje 2026'."

```

---

## Epic 3.5 — Insighti (pametne notifikacije)

### [F3-E5-T1] 🧪 Insights engine

**Kontekst:** Svake noći (cron), generišemo personalizirane uvide: "Potrošio si 40% više na hranu ovog mjeseca", "Pretplata X je porasla za 15%", itd.

**Cursor prompt:**

```

Kreiraj `lib/analytics/insights-engine.ts` sa kolekcijom detektora:

const DETECTORS = [
categoryAnomalyDetector, // MoM skok u kategoriji
subscriptionPriceChangeDetector, // pretplata skočila u cijeni
unusualTransactionDetector, // iznos > 2σ od prosjeka
dormantSubscriptionDetector, // pretplata plaćena ali ne korištena (Faza 4+)
savingsOpportunityDetector, // "Ovog mjeseca si potrošio manje na X, razmisli o cilju"
budgetBreachPredictor, // "Po trenutnom tempu, probićeš budžet X prije kraja mjeseca"
];

Svaki detector vraća: Insight[] sa fields:

- type: string
- severity: "info" | "warning" | "alert"
- title: string (user-facing, bosanski)
- body: string (markdown)
- action_url?: string
- dismissible: boolean
- valid_until: date

Insights idu u `insights` tabelu (već definisana u 01-architecture.md).

Scheduled job (Supabase cron ili Vercel cron):

- Pokreni svaku noć u 03:00 lokalnog vremena
- Za svakog aktivnog usera: generiši insights
- Dedup: ako isti tip insighta postoji u zadnjih 7 dana, ne dupliraj

Testovi: svaki detektor zasebno.

```

---

### [F3-E5-T2] 🎨 UI za insighte

**Cursor prompt:**

```

Na dashboardu, top sekcija: "Uvidi za tebe"

- Horizontal scroll kartice (mobile)
- Grid (desktop)
- Svaka kartica: ikona · title · body · CTA (ako ima)
- "X" dugme za dismiss
- Empty state: "Nema novih uvida. Sve je u redu."

Dedicated stranica `/uvidi`:

- Lista svih insighta, sortirana po datumu
- Filter: severity, type
- Mogućnost arhiviranja (ne dismiss-a)

Notifikacija sistem (in-app, bez emaila u Fazi 3):

- Badge na bell ikoni sa brojem novih
- Dropdown pokazuje zadnjih 10

Email digest — Faza 4+, ne sada.

```

---

## Epic 3.6 — Polish Faze 3

### [F3-E6-T1] 🎨 Onboarding unapređenje

**Cursor prompt:**

```

Kad user prvi put dođe na dashboard (bez podataka):

- Wizard u 4 koraka:
  1. "Dodaj svoj prvi račun"
  2. "Uvezi izvod ILI dodaj transakciju ručno"
  3. "Postavi prvi budžet"
  4. "Postavi cilj štednje"
- Progress bar gore
- Skip opcija uvijek dostupna

Nakon completion: confetti, "Spreman si!"

Podatke čuvaj u profiles.onboarding_completed (JSONB: koje korake je prešao).

```

---

### [F3-E6-T2] 📚 Dokumentacija Faze 3

**Cursor prompt:**

```

Ažuriraj docs:

- README s features Faze 3
- Help stranica: dodaj pitanja o budžetima, ciljevima, pretplatama, forecast-u
- /sigurnost: dodaj šta radi insights engine (server-side, bez slanja podataka trećim)

```


---

# FAZA 4 — Beta korisnici i validacija

**Cilj:** 5–15 pažljivo odabranih beta korisnika iz kruga foundera (prijatelji, porodica, poznanici koji prate finansije). Cilj je **validirati multi-tenant izolaciju, UX na stranim podacima, performance pod pravim opterećenjem, i naučiti šta nedostaje**.

**Trajanje:** 6–8 sedmica · **Preduvjet:** Faza 3 završena, founder koristi aplikaciju barem 2 mjeseca.

**Nije cilj Faze 4:** monetizacija, javni launch, SEO, marketing. To je Faza 5.

---

## Epic 4.1 — Multi-tenant hardening

### [F4-E1-T1] 🔒🧪 RLS audit pass (full sweep)

**Kontekst:** Prije nego što drugi korisnici vide podatke, moramo biti 100% sigurni da RLS radi na svakoj tabeli.

**Cursor prompt:**

```

Kreiraj `tests/security/rls-audit.test.ts`:

Za svaku tabelu u bazi koja ima user_id ili je povezana s user-om:

- profiles, accounts, categories, merchants (user-created), merchant_aliases (user), import_batches, parsed_transactions, transactions, user_corrections, categorization_rules, budgets, goals, recurring_transactions, insights, audit_log

Test matrix (za svaku tabelu):

1. Setup: kreiraj 2 user-a (userA i userB) preko supabase admin SDK
2. Ubaci jedan red za userA, jedan za userB
3. Autentifikuj se kao userA:
   - SELECT → vidi samo svoj red
   - INSERT sa user_id=userA → uspijeva
   - INSERT sa user_id=userB → blokirano
   - UPDATE userB-ovog reda → blokirano
   - DELETE userB-ovog reda → blokirano
4. Anonimus (bez auth):
   - SELECT → 0 redova
   - INSERT → blokirano

Assert pri svakoj tvrdnji + cleanup na kraju.

Generiši HTML izvještaj: `tests/security/RLS_REPORT.html` sa checkmarkom po tabeli.

```

**Acceptance:**
- [ ] Sve tabele testirane
- [ ] 100% pass
- [ ] Izvještaj se generiše
- [ ] Integrirano u CI (blokira deploy ako failuje)

---

### [F4-E1-T2] 🔒 Row-level throttling i abuse prevention

**Cursor prompt:**

```

Dodaj per-user limits (soft, ne hard refuse-uj, samo upozori):

- Max 10,000 transakcija (after that, advise export/archive)
- Max 50 accounts
- Max 200 categories
- Max 100 budgets
- Max 50 goals

Implementacija:

- Check u Server Actionu prije insert-a
- Ako pređeno: user-friendly message "Dostigao si maksimum X. Kontaktiraj nas za povećanje."

Global rate limits (koristi pattern iz F2-E5-T2):

- Import: 20/dan per user
- LLM kategorizacija: 100/dan per user
- API endpoint any: 300/min per user

Monitoring alert (Sentry):

- Ako neki user prelazi limite učestalo → abuse signal, provjeri ručno

```

---

### [F4-E1-T3] 🧪 Load test

**Cursor prompt:**

```

Koristi k6 ili Artillery za load test (free, lokalno):

Scenario:

- 50 simulated users, svaki:
  - Login
  - Load dashboard
  - Filter transakcije
  - Create transaction
- Ramp up: 0 → 50 za 2 min, držati 5 min, ramp down 1 min

Meri:

- p50, p95, p99 response times
- Error rate
- Database CPU (Supabase dashboard)

Pass kriterij:

- p95 < 500ms za sve endpoint-ove
- Error rate < 0.1%
- DB CPU < 70% peak

Ako ne prolazi:

- Identifikuj bottleneck (najčešće N+1 queries ili missing index)
- Fix i ponovi

Document rezultate u `docs/load-test-results.md`.

```

---

## Epic 4.2 — User management i invitacije

### [F4-E2-T1] 🔒 Invite-only sign-up

**Kontekst:** Faza 4 nije public. Samo invited mogu se registrovati.

**Cursor prompt:**

```

Migration:
create table invite_codes (
id uuid primary key default gen_random_uuid(),
code text unique not null,
created_by uuid references auth.users,
used_by uuid references auth.users,
used_at timestamptz,
expires_at timestamptz default (now() + interval '30 days'),
created_at timestamptz default now()
);

Pre-populate: 20 kodova za beta listu (ručno insert).

Sign-up flow:

- Na /prijava landing, dodaj "Imam invite kod" toggle
- Ako nema: "Trenutno smo u zatvorenom beta testu. Prijavi se na čekanje ovdje." (waiting list form)
- Ako ima: unos koda, validacija, zatim magic link
- Na potvrdi invite_codes: set used_by, used_at

Feature flag `ENABLE_INVITES` (env var): ako je off, svi mogu (za dev).

```

---

### [F4-E2-T2] 🎨 Waiting list za javnost

**Cursor prompt:**

```

Kreiraj `app/cekanje/page.tsx`:

- Hero: "Konto je trenutno u zatvorenom beta testu"
- Forma: email + razlog zašto su zainteresovani (textarea, opciono)
- Submit → insert u `waiting_list` tabelu
- Confirmation: "Obavijestićemo te čim se otvorimo."

Migration:
create table waiting_list (
id uuid primary key default gen_random_uuid(),
email text not null,
reason text,
referrer text,
created_at timestamptz default now()
);

create index on waiting_list(email);
-- Unique ne, ali deduplicate prilikom inserta (check postoji ili upsert)

Admin view (osnovno, za foundera): `/admin/cekanje` — lista, eksport CSV.

```

---

## Epic 4.3 — Feedback i telemetrija

### [F4-E3-T1] 🧪 In-app feedback widget

**Cursor prompt:**

```

Komponenta `FeedbackFab` (floating action button) u donjem desnom uglu:

- Ikona "chat bubble" ili "💬"
- Klik otvara drawer:
  - Kratka forma: "Šta misliš?"
  - Select: [Bug] [Ideja] [Opšte]
  - Textarea
  - Opcionalno: screenshot upload
  - Submit → insert u `feedback` tabela, optional email notify foundera

Migration:
create table feedback (
id uuid primary key default gen_random_uuid(),
user_id uuid references auth.users,
type text check (type in ('bug', 'idea', 'general')),
body text not null,
screenshot_path text, -- ako je upload
page_url text, -- window.location.pathname
user_agent text,
app_version text,
status text default 'new' check (status in ('new', 'triaged', 'closed')),
created_at timestamptz default now()
);

Reply loop (iz admin view-a): ne u app-u za Fazu 4, samo email reply ručno.

```

---

### [F4-E3-T2] 🧪 Privacy-respecting analytics (PostHog EU)

**Cursor prompt:**

```

Setup PostHog EU cluster (https://eu.i.posthog.com).

env:
NEXT_PUBLIC_POSTHOG_KEY=...
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

Kreiraj `lib/analytics/posthog.ts`:

- Inicijalizacija na klijentu (useEffect u root layoutu)
- Opt-in samo: ne automatski track, pitaj user-a na prvom logu in
- Consent modal: "Pomozi nam da unaprijedimo Konto" — Pristajem / Ne želim
- Čuvaj izbor u localStorage + profiles.analytics_consent

Eventi koje track-ujemo:

- page_view (automatic ali bez query params)
- feature_used: { feature: "import" | "budget_create" | ... }
- onboarding_step_completed
- error_boundary_triggered

NE track-ujemo:

- Iznose
- Imena
- Merchant-e
- Descriptione

Nikad ne šaljemo PII u PostHog. Validacija u wrapper funkciji (assert da keys nisu u blacklist-i).

Error tracking: Sentry EU (vidi 02-security-privacy, koristi PII redaction).

```

---

### [F4-E3-T3] 🎨 "O testu" stranica

**Cursor prompt:**

```

`app/(app)/o-testu/page.tsx`:

- "Dobrodošao u Konto beta"
- Šta radi aplikacija
- Šta još NE radi (poznati bugovi, missing features)
- Kako dati feedback (link na widget)
- SLA poruka: "Nisam garantovao uptime. Podaci su sigurni, ali backup-uj eksport s vremena na vrijeme."
- Contact info foundera (email)

Link na ovo u navigaciji (footer ili settings).

```

---

## Epic 4.4 — Dijeljenje/kolaboracija (ne za Fazu 4, samo priprema)

### [F4-E4-T1] 📋 Istraživanje: couples/family accounts

**Cursor prompt:**

```

NE KODIRAJ. Umjesto, kreiraj istraživački dokument `docs/research/shared-accounts.md` sa:

- Use cases: šta korisnici traže?
  - Mj brak partner vidi zajedničke budžete
  - Roditelj vidi dijete
- Modeli:
  - Model A: "Workspace" (svi imaju pristup svemu)
  - Model B: "Shared categories" (pojedinačni accounti ali zajednički budžeti)
  - Model C: "Viewing-only share" (read-only link)
- Privacy implikacije
- Tech kompleksnost (RLS modifikacije)
- Monetizacijska strategija (shared = Pro?)

Odluka se ne donosi u Fazi 4. Samo prikupljanje signala iz beta feedbacka.

```

---

## Epic 4.5 — Faza 4 QA i launch

### [F4-E5-T1] 🧪 Full regression pass

**Cursor prompt:**

```

Prije nego što pošalješ invite-ove, prođi kroz:

1. Svi E2E testovi zelen
2. Sve RLS testovi zelen
3. Lighthouse ≥ 90 na svim stranama, mobile i desktop
4. Manualni QA checklist (vidi 05-testing.md):
   - Prvi login flow
   - Import flow (3 različite banke)
   - Budget creation + breach notifikacija
   - Goal kreiranje
   - Account deletion
   - Edge case: prazan user na svim stranama

Ne pošalji invite-ove dok ovo nije PASS.

```

---

### [F4-E5-T2] 📚 Beta welcome email i onboarding

**Cursor prompt:**

```

Kreiraj template emaila (plain text + HTML):

Subject: Dobro došao u Konto beta

Poruka:

- Personalizirana: "Hej [ime]"
- Kratak pozdrav od foundera (personal, ne corporate)
- Link na aplikaciju + invite kod
- Šta očekivati (bug-ovi mogući, feedback dobrodošao)
- Privacy reassurance (1 rečenica)
- Potpis s pravim imenom

Šalji preko Resend API (https://resend.com, EU region, GDPR-safe).

env:
RESEND_API_KEY=...

lib/email/send.ts sa wrapperom.

Testiraj na sebi prvo.

```

---

### [F4-E5-T3] 🧪 Weekly beta review cadence

**Cursor prompt:**

```

Ne kod — proces. Dokument `docs/beta-process.md`:

Svake nedjelje (kao founder):

1. Pregledaj feedback tabelu
2. Pregledaj Sentry errore
3. Pregledaj PostHog funnels (koji koraci imaju drop-off?)
4. Kontaktiraj 1-2 korisnika lično (email ili poziv) — 15 min razgovor
5. Grupiši feedback u buckets:
   - Critical bug → fix ovo sedmicu
   - Usability friction → prioritize
   - Feature request → beleži ali ne obećavaj
6. Napiši kratak update beta korisnicima (opciono, mjesečno)

Metrike koje pratiš (lightweight):

- DAU / WAU
- Retention: D1, D7, D30
- Core action: import uspjeh rate
- Time to first insight (kad korisnik vidi vrijednost)

```

---

### [F4-E5-T4] 🎨 Ekran stanja i kvaliteta

**Cursor prompt:**

```

`app/status/page.tsx` (javno dostupno, bez auth):

- Header "Status Konta"
- Trenutno stanje: OK / Problemi / Održavanje (ručno upravljao za sada)
- Historija incidenata (ručno dodaj)
- Osnovne metrike (ne osjetljive):
  - Uptime zadnjih 30 dana (Vercel pokazuje, uzmi ručno)
  - Broj users (opciono, ako se osjećaš confident)

Ovo je profesionalizam move. Pokazuje da držiš ozbiljno.

```

---

## FAZA 4 — Izlazni kriteriji

Prije prelaska na Fazu 5 (public launch, monetizacija):

- [ ] ≥ 5 beta korisnika koristi aplikaciju aktivno ≥ 4 sedmice
- [ ] RLS testovi 100% prolaze u CI
- [ ] Performance p95 < 500ms na svim endpoint-ovima
- [ ] Nijedan critical bug ≥ 7 dana bez fix-a
- [ ] Onboarding completion rate > 50%
- [ ] D7 retention > 30%
- [ ] Founder ima subjektivnu sigurnost: "Ovo je proizvod koji bih preporučio".
- [ ] Odluke za Fazu 5 dokumentovane:
  - Pricing (ideje iz strateške analize: Free + godišnji €24.99 + Founder Lifetime €99)
  - Public launch kanali (BiH fokus? regionalni?)
  - Mobile strategija (native Swift/Kotlin? Capacitor? PWA first?)
  - Subscription billing provider (Stripe, Paddle?)

---

# Dodatak: Backlog maintenance

## Kako ažurirati ovaj backlog

- Nakon što završiš task, obilježi ga u commit poruci: `[F2-E1-T3] feat: upload UI sa drag & drop`
- Commit može referisati više task ID-jeva: `[F2-E3-T1][F2-E3-T3] feat: review UI + error states`
- Dokument se ažurira tek kad EPIC kompletno završi (ne per task)
- Dodaj nove epice/taskove ako otkriješ kasnije — NE mijenjaj ID postojećih

## ID konvencija

```

F<phase>-E<epic>-T<task>

Primjeri:
F0-E1-T1 → Faza 0, Epic 1, Task 1
F2-E3-T5 → Faza 2, Epic 3, Task 5

```

Ako treba dodati sub-task u budućnosti: `F2-E3-T5a`, `F2-E3-T5b`.

## Oznake taskova

- 🔒 **Security-critical** — obavezan security review
- 🧪 **Testing-heavy** — minimum 80% coverage na novi kod
- 🎨 **UX-heavy** — manualni QA prije merge-a
- ⚡ **Fast** — manji task, < 2h
- 📚 **Documentation** — nije kod, nego text
- 📋 **Research** — istraživanje, bez koda

Task može imati više oznaka (npr. 🔒🧪).

## Kapacitet i procjena

Ovaj backlog nije vremenski vezan. Kad radiš:
- Faza 0: ~2-3 sedmice (par sati dnevno)
- Faza 1: ~3-4 sedmice
- Faza 2: ~4-6 sedmica (najkompleksnija — parser)
- Faza 3: ~3-4 sedmice
- Faza 4: ~6-8 sedmica (uključuje 4 sedmice live beta)

Ukupno: 18–25 sedmica do javnog launch-a. Ovo je optimistična procjena za solo foundera s part-time commit-om. Udvostručavaj ako imaš full-time posao paralelno.

---

## Change Log backloga

| Datum | Verzija | Promjena |
|---|---|---|
| 2026-04-21 | 1.0 | Inicijalna verzija — Faze 0–4 kompletno |
```
