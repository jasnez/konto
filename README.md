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
