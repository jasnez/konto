# Konto

Next.js 15 (App Router) aplikacija — PFM / osobne financije (vidi `docs/`).

## Zahtjevi

- Node.js (LTS preporučen)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/) (za lokalni Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — automatski se instalira kroz `pnpm install`

## Lokalno pokretanje

```bash
pnpm install
pnpm supabase:start         # diže lokalni Postgres + Auth + Studio
pnpm supabase:reset         # primjenjuje migracije iz supabase/migrations/
cp .env.example .env.development.local
# otvori .env.development.local i popuni ga iz `pnpm exec supabase status`
pnpm dev
```

Aplikacija je na [http://localhost:3000](http://localhost:3000). Supabase Studio
(DB UI) na [http://localhost:54323](http://localhost:54323). Mailpit (za hvatanje
magic link email-ova lokalno) na [http://localhost:54324](http://localhost:54324).

## Env fajlovi

Next.js učita env fajlove ovim redoslijedom (raniji pobjeđuje):

| Skripta      | Redoslijed                                                            |
| ------------ | --------------------------------------------------------------------- |
| `pnpm dev`   | `.env.development.local` → `.env.local` → `.env.development` → `.env` |
| `pnpm build` | `.env.production.local` → `.env.local` → `.env.production` → `.env`   |

Zato konvencija u ovom repu:

- **`.env.development.local`** — lokalni Supabase stack (`http://127.0.0.1:54321`).
  Koristi se automatski u `pnpm dev` da radni Datum ne ide protiv produkcije.
- **`.env.local`** — cloud/produkcijski keys (fallback za `pnpm build` lokalno ili
  preview deploy-ove bez Vercel env-a). Opcionalno.
- **Vercel** — koristi svoje "Environment Variables" u UI-u, ne dira `.env*` fajlove.

`.env.example` je uvijek u sinku sa listom potrebnih ključeva i commit-ovan je.

## Auth flow i Supabase Dashboard konfiguracija

App koristi Supabase magic link + OTP kod preko `signInWithOtp`. Email koji
korisnik dobije sadrži i klikabilan link (PKCE, `/auth/callback?code=...`) i
6-cifreni kod (unosi ga u formu, koristi `verifyOtp`). OTP kod je robustniji
jer ne trpi link-prefetch (Gmail, Outlook antivirus), ni cross-browser klik.

### Supabase Dashboard — URL Configuration

U **Auth → URL Configuration**:

- **Site URL**: `http://localhost:3000` za dev; `https://<vercel-domain>` za prod.
- **Redirect URLs** (svi sa `/**` wildcard-om):
  - `http://localhost:3000/**`
  - `https://<prod-domain>/**`
  - `https://*-<team>.vercel.app/**` za preview deploy-eve

Bez `/**` na kraju, Supabase dozvoljava redirect samo na taj tačan URL, ne na
`/auth/callback` — rezultat su redirect-ovi na Site URL sa error-om.

### Supabase Dashboard — Email Templates

Default "Magic Link" template sadrži i `{{ .ConfirmationURL }}` (link) i
`{{ .Token }}` (6-cifreni kod). Ne mijenjaj ga osim ako ne želiš refresh
branding — obje varijante su potrebne da OTP forma radi.

### Custom SMTP (Resend) — preporučeno za prod

Supabase built-in SMTP je ograničen na ~2 email/sat i namijenjen samo testu.
Za prod (i agresivnije lokalno testiranje) postavi custom SMTP:

1. Resend nalog → API key sa "Sending access".
2. Supabase Dashboard → **Auth → SMTP Settings** → enable Custom SMTP:
   - Host `smtp.resend.com`, Port `465` (SSL), Username `resend`,
     Password = Resend API key.
   - Sender email: `hello@<tvoj-domain>` (domena mora biti verifikovana u
     Resend-u sa DKIM/SPF), ili `onboarding@resend.dev` za brzi test.
3. Supabase Dashboard → **Auth → Rate Limits** → povećaj "Emails sent per hour"
   sa 2 na 100 (Resend free tier: 3000/mesec).

Lokalni stack (`pnpm supabase:start`) ne koristi SMTP — šalje u Mailpit na
`http://localhost:54324`, bez rate limita i bez pravih email-ova.

## Scripts

| Skripta               | Opis                                     |
| --------------------- | ---------------------------------------- |
| `pnpm dev`            | Next.js dev server sa Turbopack-om       |
| `pnpm build`          | Produkcijski build                       |
| `pnpm start`          | Pokretanje builda                        |
| `pnpm lint`           | ESLint                                   |
| `pnpm format`         | Prettier (write)                         |
| `pnpm typecheck`      | `tsc --noEmit`                           |
| `pnpm test`           | Vitest (unit + component)                |
| `pnpm test:e2e`       | Playwright                               |
| `pnpm supabase:start` | Pokreće lokalni Supabase stack           |
| `pnpm supabase:stop`  | Zaustavlja lokalni stack                 |
| `pnpm supabase:reset` | Reset lokalne baze + primjena migracija  |
| `pnpm supabase:types` | Regeneracija `supabase/types.ts` (UTF-8) |
