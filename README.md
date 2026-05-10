# Konto

**Konto** je web aplikacija za lične finansije (PFM) fokusirana na Zapadni Balkan: ručno vođenje transakcija, računi, kategorije, izvoz podataka i brisanje naloga — bez direktne bankarske integracije u ranim fazama. Korisnički interfejs i rute su na **bosanskom**; podaci u bazi i API koriste uobičajene engleske identifikatore.

## Tech stack

- **Framework:** [Next.js](https://nextjs.org/) 15 (App Router) · React 19 · TypeScript (strict)
- **Stil & UI:** Tailwind CSS · [shadcn/ui](https://ui.shadcn.com/) + Radix · [Lucide](https://lucide.dev/) ikone
- **Backend / podaci:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS) · server actions + Zod
- **Testiranje:** [Vitest](https://vitest.dev/) · [Playwright](https://playwright.dev/) (E2E)
- **Alat:** pnpm · ESLint · Prettier · Husky

Detaljna arhitektura i odluke: [dokumentacija u `/docs/`](./docs/00-README.md) i [ADRs u `docs/decisions/`](./docs/decisions/).

## Faza 2 (produkt)

Kratki pregled korisničkih mogućnosti u toku (PFM, bez direktne bankovne konekcije u ovom obimu):

- **Uvoz bankarskog PDF-a** — upload u zaštićeno skladište, ekstrakcija teksta, PII redakcija, parsiranje preko **Gemini 2.5 Flash-Lite** (Google Generative Language API), ručni pregled i uvođenje transakcija u nalog. Zadržavanje PDF-a u skladištu usklađeno s ograničenjem (npr. 24h) i obris nakon uvođenja.
- **Pomoć u aplikaciji** — rute `/pomoc` (FAQ) i `/sigurnost` (sigurnost i privatnost, uključujući uvoz PDF-a).

## Faza 3 (finansijska inteligencija)

Funkcionalnosti dodane u Fazi 3 — alati koji aplikaciju izvode iznad ručnog spreadsheeta:

- **Budžeti** (`/budzeti`) — mjesečni i sedmični limiti po kategoriji sa progress prikazom u tri stadija (zelena/žuta/crvena). Server-strana RPC funkcija `get_current_period_spent` računa potrošnju u trenutnom periodu.
- **Pretplate** (`/pretplate`) — automatska detekcija ponavljajućih transakcija iz historije (Netflix, kirija, internet…) plus ručna potvrda kandidata. Footer pokazuje mjesečni ekvivalent svih pretplata.
- **Prognoza salda** (`/pocetna` widget "Projekcija") — projektovani saldo narednih 30/60/90 dana na osnovu recurring transakcija + linearne potrošnje. Crvena traka kad očekujemo negativan saldo, zelena ako računi izdrže.
- **Ciljevi štednje** (`/ciljevi`) — definiši cilj sa rokom i opcionalno veži za štedni račun (auto-sinhronizacija salda). Konto računa preporučeni mjesečni iznos. Confetti kad postigneš cilj.
- **Uvidi** (`/uvidi` + dashboard widget + bell ikona) — noćni cron sa 6 detektora: anomalije po kategoriji, promjena cijene pretplate, neobične transakcije, prilike za uštedu, prijetnja budžetu, neaktivne pretplate. Markdown render bodyja, dismiss/undo, severity i tip filteri.
- **Onboarding wizard** — 4-step vodič za nove usere (račun → transakcija → budžet → cilj) sa per-step persistencijom u `profiles.onboarding_completed` jsonb polju. Skip dostupan na svakom koraku.

Detaljna mapa zadataka: [`docs/06-backlog.md`](./docs/06-backlog.md) i [`docs/06-backlog 2.md`](./docs/06-backlog%202.md) (revidirana verzija).

## Zahtjevi

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/) (lokalni Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (dolazi s `pnpm` dependency-em)

## Getting started

```bash
git clone https://github.com/jasnez/konto.git
cd konto
pnpm install
```

### Supabase lokalno

Pokreće lokalni Postgres, Auth, Studio, Mailpit:

```bash
pnpm supabase:start
pnpm supabase:reset   # primijeni migracije iz supabase/migrations/ + seed
```

Ako `supabase start` pukne, vidi [docs/runbooks/local-setup.md](./docs/runbooks/local-setup.md).

### Env fajl

- Kreiraj **`.env.development.local`** (preporučeno za `pnpm dev`) i/ili **`.env.local`**.
- Za lokalni stack, iskopiraj ključeve iz `pnpm exec supabase status` (ili Supabase Studio): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (samo server-only), `NEXT_PUBLIC_SITE_URL` tipično `http://localhost:3000`.
- Kompletan popis i red env varijabli: [01-architecture.md — sekcija 9.4](./docs/01-architecture.md).

Zatim:

```bash
pnpm dev
```

Aplikacija: [http://localhost:3000](http://localhost:3000) · **Supabase Studio:** [http://127.0.0.1:54323](http://127.0.0.1:54323) · **Mailpit (email lokalno):** [http://127.0.0.1:54324](http://127.0.0.1:54324)

## Scripts

| Skripta                                 | Opis                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`                              | Next.js dev (Turbopack)                                                                 |
| `pnpm build` / `pnpm start`             | Produkcijski build i start                                                              |
| `pnpm lint`                             | ESLint                                                                                  |
| `pnpm format`                           | Prettier (write)                                                                        |
| `pnpm typecheck`                        | `tsc --noEmit`                                                                          |
| `pnpm test`                             | Vitest                                                                                  |
| `pnpm test:e2e`                         | Playwright (E2E; očekuje lokalni Supabase — vidi [05-testing.md](./docs/05-testing.md)) |
| `pnpm e2e:web`                          | `supabase start` + dev server na fiksnom portu (kao u Playwright config-u)              |
| `pnpm supabase:start` / `supabase:stop` | Lokalni Supabase                                                                        |
| `pnpm supabase:reset`                   | Baza + migracije + seed                                                                 |
| `pnpm supabase:types`                   | Regeneracija `supabase/types` iz lokalne šeme                                           |

## Dokumentacija (`/docs/`)

| Dokument                                                     | Sadržaj                                              |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| [docs/00-README.md](./docs/00-README.md)                     | Pregled cijele dokumentacije i redoslijed čitanja    |
| [docs/01-architecture.md](./docs/01-architecture.md)         | Arhitektura, data model, novac (bigint), deployment  |
| [docs/02-security-privacy.md](./docs/02-security-privacy.md) | Sigurnost, GDPR, RLS                                 |
| [docs/03-design-system.md](./docs/03-design-system.md)       | UI, pristupačnost, copy                              |
| [docs/04-cursorrules.md](./docs/04-cursorrules.md)           | Pravila za rad s Cursorom / AI                       |
| [docs/05-testing.md](./docs/05-testing.md)                   | Test piramida, E2E, integracija                      |
| [docs/06-backlog.md](./docs/06-backlog.md)                   | Faze, epics, taskovi                                 |
| [docs/runbooks/](./docs/runbooks/)                           | Operativni vodiči (backup, migracije, lokalni setup) |
| [docs/decisions/](./docs/decisions/)                         | **ADR** — zabilježene arhitektonske odluke           |

## Licenca / vlasništvo

Privatni repozitorij. Prava zadržava vlasnik projekta.
