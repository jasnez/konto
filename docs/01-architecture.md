# Konto — Arhitektura i Data Model

**Verzija:** 1.1 · **Datum:** april 2026. · **Autor:** Solo founder (BiH)
**Status:** Live document — ažurirati s promjenama; ne pisati kod koji mu protivuriječi bez update-a.

---

## 1. Cilj dokumenta

Ovaj dokument je **single source of truth** za tehničku arhitekturu Konto aplikacije. Sve odluke o data modelu, servisnim slojevima, vanjskim integracijama i ML pipeline-u su definisane ovdje. Cursor, svaki novi codebase assistant, svaki budući ti-iz-budućnosti — svi kreću odavde.

Pravila čitanja:

- Ako pišeš kod koji nije u skladu s ovim dokumentom, prvo ažuriraj dokument, potom kod.
- Svaka sekcija označena 🔒 je **nepregovarivo** (narušavanje znači bezbjednosni incident ili nemogući refactoring).
- Svaka sekcija označena ⚠️ je **pretpostavka** koju treba validirati u Fazi 1–2.

---

## 2. Vision & Constraints

**Proizvod:** Lokalna, privatna, jezički prilagođena PFM aplikacija za Zapadni Balkan. Primarna vrijednost: **parsiranje PDF bankarskih izvoda** + pametna kategorizacija + insights. Otvarana bez povezivanja banke.

**Primarni korisnik Faze 0–3:** Ti (founder, BiH, 2–3 banke, BAM + EUR + povremeno RSD, gotovina, Revolut/Wise).

**Primarni korisnik Faze 4+:** Pojedinac ili porodica u BiH, Srbiji, CG, SMK, 25–55 godina, latiničar, koristi mobilni kao primarni uređaj.

**Non-goals (eksplicitno NE gradimo):**

- Investicijsko praćenje, crypto, NFT, net worth dashboardi
- Plaćanje, prenos novca, bilo kakav movement of funds
- Kreditno savjetovanje, loan comparison, kartica-affiliate
- Direct bank API integracija u Fazi 0–4 (razmotrićemo u Fazi 5+)
- Multi-user account sharing u Fazi 0–3 (Faza 4 uvodi basic family sharing)

**Ključna ograničenja:**

- Solo founder, minimalan budžet (€500/mj ceiling prve godine)
- Razvoj kroz Cursor (stack mora biti LLM-friendly)
- Mobile-first, PWA u Fazi 0–4, native u Fazi 5+
- Multi-currency od prvog dana (BAM, EUR, RSD, USD minimum)
- Regulatorno: ne klasifikujemo se kao AIS/PSP — čist data processor

---

## 3. High-Level Architecture

### 3.1 Komponente sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                          KLIJENT                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Next.js 15 (App Router) · PWA · TypeScript · Tailwind    │  │
│  │ - Server Components (default)                             │  │
│  │ - Client Components (samo za interaktivnost)              │  │
│  │ - Service Worker (offline, cache)                         │  │
│  │ - Supabase Client SDK (auth, realtime read)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER (Vercel)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Next.js API Routes / Server Actions                       │  │
│  │ - Validacija (Zod)                                        │  │
│  │ - Autorizacija (Supabase server client)                   │  │
│  │ - Orkestracija poslovne logike                            │  │
│  │ - Pozivi prema LLM / FX / OCR servisima                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
              │                   │                   │
              ▼                   ▼                   ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   SUPABASE EU    │   │  EXTERNAL AI     │   │  FX API          │
│  (Frankfurt)     │   │  - Gemini        │   │  - Frankfurter   │
│  - Postgres      │   │  - Mistral OCR   │   │  - exchangerate  │
│  - Auth          │   │  (Faza 2+)       │   │    .host         │
│  - Storage       │   │                  │   │                  │
│  - Edge Funcs    │   │                  │   │                  │
│  - pg_cron       │   │                  │   │                  │
│  - RLS enforced  │   │                  │   │                  │
└──────────────────┘   └──────────────────┘   └──────────────────┘
```

### 3.2 Regionalnost 🔒

**Sve kritične podatke hostamo u EU:**

- Supabase projekat: **Frankfurt (eu-central-1)** ili **Ireland (eu-west-1)**
- Vercel deploy regions: **fra1, dub1** za server functions
- Gemini API pozivi: **eu-west region** kad god je dostupno
- PII logovi: nikad ne napuštaju EU

**Zašto 🔒:** Transfer outside-EU znači SCC-ove, dodatne procjene adekvatnosti, i otežan compliance s GDPR + lokalnim zakonima (novi ZLPP u BiH, ZZPL u Srbiji).

### 3.3 Tech stack (finalan za Faze 0–4)

| Sloj                   | Tehnologija                        | Verzija           | Obrazloženje                              |
| ---------------------- | ---------------------------------- | ----------------- | ----------------------------------------- |
| Frontend framework     | Next.js                            | 15.x (App Router) | Cursor najbolje pokriva                   |
| Jezik                  | TypeScript                         | 5.6+ (strict)     | Type safety za financije je nepregovarivo |
| UI komponente          | shadcn/ui + Radix                  | latest            | Copy-paste, full control, dark mode       |
| Styling                | Tailwind CSS                       | 3.4+              | Konvencija, Cursor-friendly               |
| Form handling          | React Hook Form + Zod              | latest            | Validacija shared client/server           |
| Data fetching          | Server Components + Server Actions | Next 15           | Minimizira client bundle                  |
| State (client)         | Zustand                            | 5.x               | Samo gdje je stvarno potrebno             |
| Charts                 | Recharts                           | 2.x               | Besplatan, dovoljan za PFM                |
| Icons                  | Lucide React                       | latest            | Dolazi sa shadcn                          |
| Database               | PostgreSQL via Supabase            | 15+               | RLS = built-in per-user izolacija         |
| Auth                   | Supabase Auth                      | latest            | Email magic link, passkey kasnije         |
| File storage           | Supabase Storage                   | latest            | RLS policies za PDF-ove                   |
| Background jobs        | Supabase Edge Functions + pg_cron  | latest            | Za FX refresh, PDF cleanup                |
| Email                  | Resend                             | free tier         | 3k mj besplatno, dovoljno                 |
| Analytics              | PostHog (EU cloud)                 | latest            | Privacy-friendly, 1M eventa besplatno     |
| Error tracking         | Sentry                             | free tier         | sa `beforeSend` PII redakcijom            |
| LLM (Faza 2+)          | Gemini 2.5 Flash-Lite              | latest            | €0.006/izvod, jeftin i tačan              |
| OCR fallback (Faza 2+) | Mistral OCR 3                      | latest            | $0.001/stranica za skenove                |
| FX rates               | Frankfurter API + ECB fallback     | -                 | ECB zvanični kursevi                      |
| Hosting (app)          | Vercel                             | Hobby → Pro       | Free za Fazu 0, $20/mj od Faze 4          |
| DNS / CDN              | Cloudflare                         | free              | DNS + DDoS zaštita                        |
| Version control        | GitHub                             | free              | Privatni repo                             |
| IDE                    | Cursor                             | Pro               | Claude Sonnet 4.6 / Opus model            |

**Eksplicitno NE koristimo:**

- Firebase (vendor lock-in, nepredvidiva cijena)
- Auth0/Clerk (preskupo, Supabase Auth dovoljan)
- MongoDB/NoSQL (financije traže ACID tranzakcije)
- Redis u Fazi 0–3 (Postgres je dovoljan do 10k korisnika)
- GraphQL (overengineering za solo projekat)
- tRPC (dupliranje posla, Server Actions dovoljne)
- Microservices (monolit se skalira bez problema)

---

## 4. Monetary Fundamentals 🔒

Ovo je sekcija koju **pročitaj dvaput**. 90% financijskih bug-ova u aplikacijama dolazi odavde.

### 4.1 Iznosi uvijek kao INTEGER u minor units

```typescript
// KRIVO — nikad ovako
const price = 12.99; // float precision pakao
const total = price * 1.17; // 15.198300000000002

// TAČNO — uvijek ovako
const priceCents = 1299; // 1299 "centa" = 12.99
const taxRate = 17; // u bps (basis points)? ili percent × 100?
const totalCents = Math.round(priceCents * 1.17); // zaokruži EKSPLICITNO
```

**Pravilo 🔒:** Svaki novčani iznos u bazi, API payload-u, biznis logici je **`bigint` u najmanjim jedinicama valute** (centi za EUR, feninzi za BAM, pare za RSD, centi za USD).

**Konverzija u UI:** Tek na samoj ivici render-a:

```typescript
function formatAmount(cents: bigint, currency: string, locale = 'bs-BA'): string {
  const amount = Number(cents) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
```

**Pravilo za minor units po valuti:**

- BAM, EUR, RSD, USD, GBP, CHF — 2 decimale, `cents = amount × 100`
- JPY, HUF — 0 decimala (ako ikad dođemo), `cents = amount`
- BHD, KWD — 3 decimale (ne očekujemo, ali budi svjestan)

### 4.2 Multi-currency model 🔒

Svaka transakcija **uvijek** čuva šest podataka:

| Field                   | Tip               | Opis                                     |
| ----------------------- | ----------------- | ---------------------------------------- |
| `original_amount_cents` | `bigint`          | Kako ga je banka zabilježila             |
| `original_currency`     | `text` (ISO 4217) | Valuta računa / transakcije              |
| `base_amount_cents`     | `bigint`          | Konvertovano u korisnikovu base currency |
| `base_currency`         | `text` (ISO 4217) | Korisnikova izabrana reporting valuta    |
| `fx_rate`               | `numeric(20,10)`  | Rate = base/original, snapshot           |
| `fx_rate_date`          | `date`            | Datum rate-a koji smo koristili          |

**Zašto oba iznosa, a ne samo konvertovani:**

1. Bank reconciliacija — korisnik mora moći da vidi isti iznos kao u svojoj banci
2. Historical accuracy — FX kursevi se mijenjaju, ali prošla transakcija je finalna
3. Promjena base currency — ako prebaciš sa BAM na EUR, možeš rekonvertovati sve ex-post

**Pravilo koji FX kurs koristimo:**

- Za transakcije parsirane iz PDF-a: FX rate **na datum transakcije** (ne trenutni)
- Za manualne transakcije: FX rate **na datum unosa** (korisnik može override-ovati)
- Izvor: ECB kurs iz Frankfurter API-ja, fallback na exchangerate.host
- Kad izvor nije dostupan: koristi zadnji poznati rate, **flag-uj transakciju** kao `fx_stale`

### 4.3 BAM specifičnosti

**BAM je vezan za EUR fiksnim kursom** (Currency Board od 1997):

- **1 EUR = 1,95583 BAM** (konstantno)
- **1 BAM = 0,51129 EUR** (obrnuto)

Ovo znači: za BAM↔EUR konverzije **NE pozivamo FX API** — koristimo hardcoded konstantu. Za ostale valute (RSD, USD, GBP...), konvertujemo preko EUR (BAM → EUR → USD koristi ECB kurs EUR/USD).

```typescript
// lib/fx/bam.ts
export const BAM_EUR_RATE = 1.95583;
export const EUR_BAM_RATE = 1 / BAM_EUR_RATE;

// Konstanta, ne mijenja se dok god je Currency Board aktivan.
// Flag: ako Centralna banka BiH ikad ukine CB, ovo je prva stvar za update.
```

### 4.4 Transferi između računa 🔒

**Problem:** Kad prebaciš 100 EUR sa Raiffeisen na Revolut, to nije trošak ni prihod — to je transfer. Ako ne označiš kao transfer, dashboard će pokazati −100 EUR "trošak" + 100 EUR "prihod" = netačno.

**Rješenje:** Dvije povezane transakcije:

```sql
-- Outflow transakcija (Raiffeisen −100 EUR)
INSERT INTO transactions (... is_transfer=true, transfer_pair_id=B ...)

-- Inflow transakcija (Revolut +100 EUR)
INSERT INTO transactions (... is_transfer=true, transfer_pair_id=A ...)

-- Obje imaju category_id = NULL ili category_id = <Transfers> sistemska
-- U reportingu: SUM(amount) WHERE is_transfer = false
```

Detekcija transferi se radi:

- **Manualno** u UI ("Ovo je transfer" checkbox)
- **Automatski** u Fazi 2+: matching po iznosu (±0.5%), datumu (±3 dana), i komplementarnom smjeru između dva usera-vlastita računa

---

## 5. Data Model 🔒

### 5.1 Principi

- **UUID v7 (ili v4) kao primary key** — ne auto-increment int (curenje podataka kroz sekvencu)
- **Svaki user-owned red ima `user_id`** — RLS policies provjeravaju `auth.uid() = user_id`
- **Timestamps u UTC** (`timestamptz`), front-end konvertuje u lokalnu zonu
- **Datumi u ISO 8601** (`date` tip u PG)
- **Novčani iznosi kao `bigint`** (minor units)
- **Enums kao `text` s `check` constraint-om** — lakše za migracije nego PG enum tipovi
- **`created_at`, `updated_at` na svakoj tabeli** + trigger koji updateuje `updated_at`
- **Soft delete gdje god ima smisla** — kolumna `deleted_at timestamptz`, views filtriraju
- **Nikad ne koristimo `truncate` ili `delete from` bez WHERE** u produkciji

### 5.2 Kompletna shema (Faza 0 initial)

```sql
-- ==========================================
-- EXTENSIONS
-- ==========================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";        -- fuzzy text matching

-- ==========================================
-- UTILITY FUNCTIONS
-- ==========================================
create or replace function public.trigger_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- RLS helperi za defense-in-depth: provjeravaju da referenced row pripada
-- trenutnom user-u. Koriste se u WITH CHECK izrazima policy-ja na tabelama
-- čiji insert/update referencira druge korisnikove resurse (account_id,
-- split_parent_id, transfer_pair_id, itd.).
create or replace function public.user_owns_account(p_account_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = p_account_id
      and a.user_id = (select auth.uid())
      and a.deleted_at is null
  );
$$;

create or replace function public.user_owns_transaction(p_tx_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.transactions t
    where t.id = p_tx_id
      and t.user_id = (select auth.uid())
      and t.deleted_at is null
  );
$$;

-- ==========================================
-- PROFILES (extends auth.users)
-- ==========================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency text not null default 'BAM'
    check (base_currency in ('BAM','EUR','USD')),
  locale text not null default 'bs-BA'
    check (locale in ('bs-BA','en-US')),
  timezone text not null default 'Europe/Sarajevo',
  week_start smallint not null default 1 check (week_start in (0,1)),   -- 1=pon
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.trigger_set_updated_at();

alter table public.profiles enable row level security;

create policy "users read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================
-- ACCOUNTS (banka, gotovina, Revolut, kartice)
-- ==========================================
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                                         -- "Raiffeisen tekući", "Gotovina"
  type text not null check (type in (
    'checking','savings','cash','credit_card',
    'revolut','wise','investment','loan','other'
  )),
  institution text,                                           -- "Raiffeisen Bank BiH", null za gotovinu
  institution_slug text,                                      -- 'raiffeisen-ba', za parser matching
  account_number_last4 text,                                  -- samo zadnje 4 cifre, nikad ceo IBAN
  currency text not null check (char_length(currency) = 3),
  initial_balance_cents bigint not null default 0,
  current_balance_cents bigint not null default 0,            -- computed/cached; denormalized
  icon text,                                                  -- emoji ili lucide name
  color text,                                                 -- hex
  is_active boolean not null default true,
  include_in_net_worth boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_accounts_user on public.accounts(user_id) where deleted_at is null;
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.trigger_set_updated_at();

alter table public.accounts enable row level security;
create policy "users manage own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- CATEGORIES (per-user, hijerarhijske)
-- ==========================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,                                         -- lowercased, normalized
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  kind text not null default 'expense'
    check (kind in ('expense','income','transfer','saving','investment')),
  is_system boolean not null default false,                   -- seed kategorije
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, slug)
);

create index idx_categories_user on public.categories(user_id) where deleted_at is null;
create index idx_categories_parent on public.categories(parent_id);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.trigger_set_updated_at();

alter table public.categories enable row level security;
create policy "users manage own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- MERCHANTS (per-user dictionary; shared kasnije)
-- ==========================================
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,                               -- "Konzum"
  display_name text not null,                                 -- "Konzum"
  default_category_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  notes text,
  transaction_count int not null default 0,                   -- counter-cache
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, canonical_name)
);

create index idx_merchants_user on public.merchants(user_id) where deleted_at is null;
create index idx_merchants_trgm on public.merchants using gin (canonical_name gin_trgm_ops);
create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.trigger_set_updated_at();

alter table public.merchants enable row level security;
create policy "users manage own merchants" on public.merchants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aliasi: "KONZUM BL BANJA LUKA" → Konzum
create table public.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  pattern text not null,                                      -- može biti regex ili literal
  pattern_type text not null default 'contains'
    check (pattern_type in ('exact','contains','starts_with','regex')),
  created_at timestamptz not null default now()
);

create index idx_aliases_merchant on public.merchant_aliases(merchant_id);
create index idx_aliases_user on public.merchant_aliases(user_id);
alter table public.merchant_aliases enable row level security;
create policy "users manage own aliases" on public.merchant_aliases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- IMPORT BATCHES (PDF/CSV/Excel upload sessions)
-- ==========================================
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  source_type text not null check (source_type in ('pdf','csv','xlsx','mt940','camt053','manual_bulk')),
  filename text,
  file_size_bytes bigint,
  file_hash_sha256 text,                                      -- duplicate detection
  storage_path text,                                          -- Supabase Storage path
  status text not null default 'pending' check (status in (
    'pending','parsing','review','completed','failed','cancelled'
  )),
  parser_version text,                                        -- koji parser smo koristili
  parser_model text,                                          -- LLM model ako je korišten
  parser_cost_cents int,                                      -- koliko nas je koštalo u centima USD
  transactions_detected int default 0,
  transactions_imported int default 0,
  transactions_skipped int default 0,
  error_message text,
  warnings jsonb default '[]',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create index idx_batches_user on public.import_batches(user_id, created_at desc)
  where deleted_at is null;
create index idx_batches_hash on public.import_batches(user_id, file_hash_sha256)
  where deleted_at is null;

alter table public.import_batches enable row level security;
create policy "users manage own batches" on public.import_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- TRANSACTIONS (srce sistema)
-- ==========================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,

  -- Iznosi
  original_amount_cents bigint not null,                      -- može biti negativno
  original_currency text not null check (char_length(original_currency) = 3),
  base_amount_cents bigint not null,
  base_currency text not null check (char_length(base_currency) = 3),
  fx_rate numeric(20,10),                                     -- base_amount / original_amount
  fx_rate_date date,
  fx_stale boolean default false,                             -- ako nismo imali svjež rate

  -- Datumi
  transaction_date date not null,                             -- kad se desilo
  posted_date date,                                           -- kad je knjiženo u banci
  value_date date,                                            -- value date (bankarski pojam)

  -- Merchant i opis
  merchant_raw text,                                          -- kako ga je banka zapisala
  merchant_id uuid references public.merchants(id) on delete set null,
  description text,                                           -- dodatni bank opis
  notes text,                                                 -- user notes

  -- Kategorija
  category_id uuid references public.categories(id) on delete set null,
  category_confidence real check (category_confidence between 0 and 1),
  category_source text check (category_source in (
    'user','rule','alias','fuzzy','embedding','llm','default','imported'
  )),

  -- Transfer handling
  is_transfer boolean not null default false,
  transfer_pair_id uuid references public.transactions(id) on delete set null,

  -- Source tracking
  source text not null check (source in (
    'manual','import_pdf','import_csv','import_xlsx',
    'quick_add','voice','recurring','split'
  )),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  split_parent_id uuid references public.transactions(id) on delete cascade,

  -- Flags
  is_pending boolean not null default false,                  -- pending/cleared
  is_reconciled boolean not null default false,               -- korisnik potvrdio
  is_excluded boolean not null default false,                 -- isključi iz reporting-a
  is_recurring boolean not null default false,
  recurring_group_id uuid,

  -- Duplikati
  external_id text,                                           -- bank-provided ID ako postoji
  dedup_hash text,                                            -- hash(amount+date+merchant+account)

  -- Geolocation (optional, Faza 3+)
  latitude numeric(10,7),
  longitude numeric(10,7),

  -- Meta
  tags text[] default '{}',
  attachments jsonb default '[]',                             -- referenci na Storage fajlove

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Indeksi koji stvarno koristimo
create index idx_tx_user_date on public.transactions(user_id, transaction_date desc)
  where deleted_at is null;
create index idx_tx_account on public.transactions(account_id, transaction_date desc)
  where deleted_at is null;
create index idx_tx_category on public.transactions(category_id) where deleted_at is null;
create index idx_tx_merchant on public.transactions(merchant_id) where deleted_at is null;
create index idx_tx_batch on public.transactions(import_batch_id);
create index idx_tx_dedup on public.transactions(user_id, dedup_hash) where deleted_at is null;
create index idx_tx_transfer_pair on public.transactions(transfer_pair_id);
create index idx_tx_merchant_raw_trgm on public.transactions
  using gin (merchant_raw gin_trgm_ops);

create trigger tx_updated_at before update on public.transactions
  for each row execute function public.trigger_set_updated_at();

alter table public.transactions enable row level security;

-- Ownership of account_id, split_parent_id i transfer_pair_id se eksplicitno
-- provjerava u WITH CHECK-u (defense-in-depth) — `auth.uid() = user_id`
-- sam nije dovoljan, jer napadač može znati tuđi account_id (leak, insider,
-- screenshots) i upisati transakciju koja bi pomjerila tuđi balance trigger.
create policy "users read own transactions" on public.transactions
  for select using ((select auth.uid()) = user_id);

create policy "users insert own transactions" on public.transactions
  for insert with check (
    (select auth.uid()) = user_id
    and public.user_owns_account(account_id)
    and (split_parent_id is null or public.user_owns_transaction(split_parent_id))
    and (transfer_pair_id is null or public.user_owns_transaction(transfer_pair_id))
  );

create policy "users update own transactions" on public.transactions
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.user_owns_account(account_id)
    and (split_parent_id is null or public.user_owns_transaction(split_parent_id))
    and (transfer_pair_id is null or public.user_owns_transaction(transfer_pair_id))
  );

create policy "users delete own transactions" on public.transactions
  for delete using ((select auth.uid()) = user_id);

-- ==========================================
-- USER CORRECTIONS (training signal)
-- ==========================================
create table public.user_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  field text not null check (field in (
    'category','merchant','amount','date','description','tags','is_transfer'
  )),
  old_value text,
  new_value text,
  old_value_json jsonb,                                       -- za kompleksne tipove
  new_value_json jsonb,
  source_before text,                                         -- šta je ranije predložilo
  confidence_before real,
  created_at timestamptz not null default now()
);

create index idx_corrections_user on public.user_corrections(user_id, created_at desc);
create index idx_corrections_field on public.user_corrections(user_id, field);

alter table public.user_corrections enable row level security;
create policy "users read own corrections" on public.user_corrections
  for select using (auth.uid() = user_id);
create policy "users insert own corrections" on public.user_corrections
  for insert with check (auth.uid() = user_id);

-- ==========================================
-- CATEGORIZATION RULES (user-defined)
-- ==========================================
create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  priority int not null default 0,                            -- veći = prije

  -- Conditions (sve ANDed)
  match_merchant_pattern text,
  match_merchant_pattern_type text check (match_merchant_pattern_type in ('exact','contains','regex')),
  match_description_pattern text,
  match_account_id uuid references public.accounts(id) on delete cascade,
  match_amount_min_cents bigint,
  match_amount_max_cents bigint,
  match_amount_sign text check (match_amount_sign in ('positive','negative','any')),

  -- Actions
  set_category_id uuid references public.categories(id) on delete cascade,
  set_merchant_id uuid references public.merchants(id) on delete set null,
  set_tags text[],
  set_is_transfer boolean,
  set_is_excluded boolean,

  is_active boolean not null default true,
  applied_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_rules_user on public.categorization_rules(user_id, priority desc)
  where is_active = true;
create trigger rules_updated_at before update on public.categorization_rules
  for each row execute function public.trigger_set_updated_at();

alter table public.categorization_rules enable row level security;
create policy "users manage own rules" on public.categorization_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- BUDGETS (Faza 3)
-- ==========================================
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id) on delete cascade,
  amount_cents bigint not null,
  currency text not null,
  period text not null check (period in ('weekly','monthly','yearly','custom')),
  period_start_day int default 1,                             -- 1=pon za weekly, day-of-month za monthly
  rollover_unused boolean default false,
  start_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.budgets enable row level security;
create policy "users manage own budgets" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- GOALS (Faza 3)
-- ==========================================
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  target_amount_cents bigint not null,
  currency text not null,
  current_amount_cents bigint not null default 0,
  linked_account_id uuid references public.accounts(id) on delete set null,
  target_date date,
  priority int default 0,
  icon text,
  color text,
  status text not null default 'active' check (status in ('active','achieved','paused','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.goals enable row level security;
create policy "users manage own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- RECURRING TRANSACTIONS / SUBSCRIPTIONS (Faza 3)
-- ==========================================
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant_id uuid references public.merchants(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,

  amount_cents bigint not null,
  currency text not null,
  amount_is_estimate boolean default false,                   -- za varijabilne (struja)

  cadence text not null check (cadence in (
    'daily','weekly','biweekly','monthly','bimonthly','quarterly','semiannually','yearly','custom'
  )),
  cadence_day int,                                            -- day of week/month
  last_occurrence_date date,
  next_expected_date date,

  kind text not null default 'subscription' check (kind in (
    'subscription','bill','salary','rent','loan_payment','other'
  )),
  is_auto_detected boolean default false,
  confidence real check (confidence between 0 and 1),
  is_active boolean default true,
  notify_days_before int default 3,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);

alter table public.recurring_transactions enable row level security;
create policy "users manage own recurrences" on public.recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================
-- FX RATES (shared cache)
-- ==========================================
create table public.fx_rates (
  date date not null,
  base text not null default 'EUR' check (char_length(base) = 3),
  quote text not null check (char_length(quote) = 3),
  rate numeric(20,10) not null check (rate > 0),
  source text not null default 'ecb' check (source in ('ecb','frankfurter','exchangerate_host','manual','currency_board')),
  fetched_at timestamptz not null default now(),
  primary key (date, base, quote)
);

create index idx_fx_quote_date on public.fx_rates(quote, date desc);

-- FX je shared, ne per-user; select je public (čitaju se), insert samo service role
alter table public.fx_rates enable row level security;
create policy "anyone reads fx rates" on public.fx_rates for select using (true);
-- insert/update ide samo kroz service role (Edge Function)

-- ==========================================
-- AUDIT LOG (kritične akcije)
-- ==========================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,                                   -- 'signin','signout','export','delete_account','bulk_delete',...
  event_data jsonb,
  ip_hash text,                                               -- SHA256 IP-a, ne sirovi IP
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_log(user_id, created_at desc);
create index idx_audit_event on public.audit_log(event_type, created_at desc);

alter table public.audit_log enable row level security;
create policy "users read own audit" on public.audit_log
  for select using (auth.uid() = user_id);
-- insert samo kroz service role

-- ==========================================
-- INSIGHTS (generated insights za dashboard)
-- ==========================================
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                                         -- 'spending_spike','subscription_detected','budget_alert',...
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null,
  body text not null,
  action_label text,
  action_url text,
  data jsonb,                                                 -- kontekst (iznos, %, merchant, ...)
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

create index idx_insights_user on public.insights(user_id, created_at desc)
  where is_dismissed = false;
alter table public.insights enable row level security;
create policy "users manage own insights" on public.insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 5.3 Seed podaci za BiH

Default kategorije (sve per-user, kreirane pri signup):

**Expense:** Hrana i piće 🍽️, Namirnice 🛒, Stanovanje 🏠, Komunalije 💡, Prevoz 🚗, Gorivo ⛽, Zdravlje 🏥, Odjeća i obuća 👕, Zabava 🎬, Pretplate 📱, Obrazovanje 🎓, Djeca 🧸, Pokloni i donacije 🎁, Putovanja ✈️, Lična njega 💆, Kućni ljubimci 🐕, Bankarske naknade 🏦, Porezi 📋, Ostalo 📦

**Income:** Plata 💰, Freelance 💼, Bonus 🎉, Kamata 📈, Poklon 🎁, Povrat ↩️, Ostali prihodi 💵

**Transfer:** Transferi 🔄 (sistemska, ne može se obrisati)

### 5.4 BiH merchant dictionary (seed za parser)

Ovo je živa lista; inicijalno seedaj top ~100 merchanta u `/db/seeds/merchants-ba.sql`, raste kroz korekcije.

**Maloprodaja hrane:** Konzum, Bingo, Interex, Amko, Mercator, Robot, Hoše Komerc, Dugi, FIS Vitez, Tuš, Merkator, Eurospin, Lidl

**Apoteke:** Apoteka "1", Apoteka Sarajevo, Apoteka Meljen, Farmavita, Laboratoria

**Gorivo:** Hifa-Oil, Petrol, OMV, INA, Gazprom, Holdina, Lukoil

**Komunalije BiH:** Elektroprivreda BiH (EPBIH), Elektroprivreda RS (ERS), Elektrodistribucija HZ HB, Toplane Sarajevo, Toplane Banja Luka, BH Telecom, HT Eronet, m:tel, Logosoft, Telrad, ViK Sarajevo, Vodovod Banja Luka, Sarajevogas

**Transport:** GRAS Sarajevo, BIMES Mostar, Centrotrans, FlixBus, Uber (Mostar), Taxi Sarajevo, Železnice FBiH, Železnice RS

**Online:** Amazon, eBay, AliExpress, Glovo, Wolt, Viber, Netflix, Spotify, YouTube Premium, iCloud, Google One, Apple One, Steam, Epic Games

**Banke (za pattern matching bankarskih naknada):** Raiffeisen Bank, UniCredit Bank, Intesa Sanpaolo, NLB Banka, Sparkasse Bank, Nova banka, MF banka, ASA Banka, Bosna Bank International, Addiko, ProCredit, Union banka, Ziraat Bank, Privredna banka Sarajevo, Razvojna banka FBiH

### 5.5 Denormalization i computed fields

**Šta je denormalizovano (i zašto):**

- `accounts.current_balance_cents` — računa se kroz trigger na `transactions` insert/update/delete (puni re-sum: `sum(account_ledger_cents)`). Kolona `account_ledger_cents` na transakciji = potpisani iznos u **valuti tog računa** (aplikacijski izračun, uključujući FX u valutu računa kada strani `original` i korisnički `base` nisu ista valuta kao račun — npr. profil EUR, tekući BAM, račun u SEK). Alternativa (live sum u aplikaciji) je presporo za dashboard sa 5000+ transakcija. Izvedeno poljem je kompromis; može se rebuildati iz primary data kroz RPC funkciju.
- `merchants.transaction_count` — trigger update-uje na svakoj tx operaciji.
- `categorization_rules.applied_count` — update-uje se u aplikacionom sloju.

**Trigger pattern (migracija 00036+):** Funkcija `update_account_balance()` nakon svakog INSERT/UPDATE/DELETE na `transactions` postavlja `current_balance_cents = coalesce(sum(t.account_ledger_cents) …)` — jedan izvor istine, bez CASE u bazi. Aplikacija i RPC (`create_transfer_pair`, `finalize_import_batch`) uvek pune `account_ledger_cents` pri umetanju.

**Važno:** Ako ikad radiš bulk operaciju (import 500 transakcija), privremeno disable-uj trigger i rebuild balance na kraju — inače je N× sporije.

---

## 6. API Design

### 6.1 Principi

- **Server Actions za mutation-e** koje zove UI direktno
- **Route Handlers (`/api/*`) za:**
  - Webhook-ove (payments, monitoring)
  - Background jobs pozvane iz pg_cron
  - Eksterno izloženi endpointi (Faza 5+, možda)
- **Klijent-side nikad direktno na Supabase za sensitive mutation-e** — uvijek kroz Server Action koji validira
- **RLS + eksplicitna autorizacija u aplikaciji** — defense in depth

### 6.2 Obrazac Server Action-a

```typescript
// app/(app)/transakcije/actions.ts
'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const CreateTransactionSchema = z.object({
  account_id: z.string().uuid(),
  amount_cents: z.bigint().refine((v) => v !== 0n, 'Iznos ne može biti 0'),
  currency: z.string().length(3),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  merchant_raw: z.string().max(200).optional(),
  category_id: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export async function createTransaction(input: unknown) {
  // 1. Validate
  const parsed = CreateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'VALIDATION_ERROR', details: parsed.error.flatten() };
  }

  // 2. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'UNAUTHORIZED' };

  // 3. Authorize — provjeri da user posjeduje account
  const { data: account } = await supabase
    .from('accounts')
    .select('id, currency')
    .eq('id', parsed.data.account_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();
  if (!account) return { success: false, error: 'ACCOUNT_NOT_FOUND' };

  // 4. Business logic — FX konverzija
  const { data: profile } = await supabase
    .from('profiles')
    .select('base_currency')
    .eq('id', user.id)
    .single();
  const baseCurrency = profile?.base_currency ?? 'BAM';
  const { baseCents, fxRate, fxDate, fxStale } = await convertToBase(
    parsed.data.amount_cents,
    parsed.data.currency,
    baseCurrency,
    parsed.data.transaction_date,
  );

  // 5. Dedup
  const dedupHash = await computeDedupHash({
    account_id: parsed.data.account_id,
    amount_cents: parsed.data.amount_cents,
    date: parsed.data.transaction_date,
    merchant: parsed.data.merchant_raw,
  });

  // 6. Insert
  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: parsed.data.account_id,
      original_amount_cents: parsed.data.amount_cents,
      original_currency: parsed.data.currency,
      base_amount_cents: baseCents,
      base_currency: baseCurrency,
      fx_rate: fxRate,
      fx_rate_date: fxDate,
      fx_stale: fxStale,
      transaction_date: parsed.data.transaction_date,
      merchant_raw: parsed.data.merchant_raw,
      category_id: parsed.data.category_id,
      notes: parsed.data.notes,
      source: 'manual',
      dedup_hash: dedupHash,
    })
    .select()
    .single();

  if (error) {
    console.error('create_transaction_error', { userId: user.id, error: error.message });
    return { success: false, error: 'DATABASE_ERROR' };
  }

  // 7. Cache invalidation
  revalidatePath('/transakcije');
  revalidatePath('/dashboard');

  return { success: true, data: tx };
}
```

### 6.3 Error handling taxonomy

Svi Server Actions vraćaju `{ success: boolean, data?, error?, details? }`. Kodovi:

| Kod                      | HTTP ekvivalent | Značenje                             |
| ------------------------ | --------------- | ------------------------------------ |
| `UNAUTHORIZED`           | 401             | User nije ulogiran                   |
| `FORBIDDEN`              | 403             | User nema pristup resursu            |
| `NOT_FOUND`              | 404             | Resurs ne postoji (ili RLS filtrira) |
| `VALIDATION_ERROR`       | 400             | Zod validacija neuspjela             |
| `CONFLICT`               | 409             | Duplikat, stanje konflikt            |
| `RATE_LIMITED`           | 429             | Previše zahtjeva                     |
| `DATABASE_ERROR`         | 500             | PG greška                            |
| `EXTERNAL_SERVICE_ERROR` | 502             | LLM/FX/email neuspjeh                |
| `INTERNAL_ERROR`         | 500             | Sve ostalo                           |

### 6.4 Rate limiting

Faza 0–2: Ne implementiramo eksplicitno (Supabase ima svoje limite).
Faza 3+: Upstash Redis + sliding window za:

- Magic link send: 3/sat/email
- PDF upload: 10/dan/user
- LLM-powered endpoint-i: 50/dan/user

---

## 7. PDF Parsing Pipeline (Faza 2)

### 7.1 Arhitektura

```
Upload → Validate → Hash & dedup → Detect type
                                        │
                                        ▼
                              Extract text (PyMuPDF)
                                        │
                    ┌───────────────────┴────────────────┐
                    ▼ text exists                        ▼ scanned
            Template match known bank              OCR (Mistral)
                    │                                     │
              ┌─────┴──────┐                              │
              ▼ match      ▼ no match                     │
           Parse           LLM                            │
              │               │                           │
              └───────────────┴───────────────────────────┘
                                        │
                                        ▼
                              Structured transactions
                                        │
                                        ▼
                           Reconcile: sum(tx) == Δ balance
                                        │
                                        ▼
                           Categorize (cascade)
                                        │
                                        ▼
                           Detect transfers
                                        │
                                        ▼
                           Review screen → user approves
                                        │
                                        ▼
                           Commit → delete PDF ≤ 24h
```

### 7.2 Templates za top banke u BiH

Prioritet za Fazu 2:

1. **Raiffeisen Bank BiH** (najveća, ti si vjerovatno klijent)
2. **UniCredit Bank BiH**
3. **Intesa Sanpaolo Banka BiH**
4. **NLB Banka BiH**
5. **ASA Banka**

Svaka banka ima poseban template fajl: `lib/parsers/templates/raiffeisen-ba.ts`. Template definira:

- Fingerprint: regex koji pogađa njihov header ("Raiffeisen Bank d.d. Bosna i Hercegovina")
- Ekstraktori: gdje je datum, iznos, opis, saldo
- Transformacije: datum format (dd.mm.yyyy), decimalni separator (zarez)
- Currency inference: iz headera ili zadnje kolone

### 7.3 LLM prompt strukture

Preporučeni prompt za Gemini 2.5 Flash-Lite:

```
System: Ti si parser bankarskih izvoda. Vraćaš isključivo validan JSON prema datoj shemi.

User: Parsiraj sljedeći bankarski izvod. Izdvoji sve transakcije.

[PDF text ili slika]

Vrati JSON:
{
  "account": {
    "institution": string,
    "currency": string (ISO 4217),
    "account_number_last4": string | null,
    "statement_period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
    "balance_start_cents": integer,
    "balance_end_cents": integer
  },
  "transactions": [
    {
      "transaction_date": "YYYY-MM-DD",
      "value_date": "YYYY-MM-DD" | null,
      "amount_cents": integer (negativno za troškove),
      "currency": string,
      "merchant_raw": string,
      "description": string | null,
      "reference": string | null,
      "confidence": number (0-1)
    }
  ],
  "warnings": string[]
}

Pravila:
- Iznosi su u centima (1 KM = 100 feninga, 1 EUR = 100 centi). Zaokruži sve iznose.
- Troškovi su negativni brojevi, uplate pozitivni.
- Ako vidiš decimalni zarez (12,50), tretiraj kao 12.50, pretvori u 1250.
- Ako je polje nejasno, vrati confidence < 0.7 i opiši problem u warnings.
- Nikad ne izmišljaj transakcije. Ako čitaš nejasno, preskoči i dodaj warning.
- Datumi u evropskom formatu (dd.mm.yyyy) — konvertuj u ISO.
```

### 7.4 Reconciliacija

Nakon parsiranja:

```typescript
const sumOfTransactions = transactions.reduce((s, t) => s + t.amount_cents, 0n);
const expectedDelta = account.balance_end_cents - account.balance_start_cents;
const tolerance = 100n; // 1 novčana jedinica

if (abs(sumOfTransactions - expectedDelta) > tolerance) {
  batch.warnings.push({
    type: 'reconciliation_mismatch',
    expected: expectedDelta,
    actual: sumOfTransactions,
    diff: sumOfTransactions - expectedDelta,
  });
  batch.status = 'review'; // ne commitujemo automatski
}
```

**Pravilo 🔒:** Transakcije se nikad ne commituju automatski ako reconciliacija ne prolazi. Korisnik mora review-ovati.

### 7.5 Troškovi i limiti

Ocjenjeni mjesečni trošak (po korisniku):

- 2 izvoda/mj × 5 stranica = 10 stranica
- Gemini 2.5 Flash-Lite: ~$0.006/izvod = $0.012/mj
- Mistral OCR fallback (~20% slučajeva): $0.001/str × 10 × 0.2 = $0.002/mj
- Ukupno: **~$0.014/mj/korisnik**

Hard limit za Fazu 2 (dok nismo sigurni):

- 10 PDF upload-a/dan/korisnik
- Ako batch > 50 transakcija, korisnik mora confirm-ovati prije LLM poziva

---

## 8. Categorization Engine

### 8.1 Kaskadni pristup

Redoslijed isprobavanja (brzo → sporo, jeftino → skupo):

1. **Explicit user rules** (tabela `categorization_rules`, sortirane po `priority desc`)
2. **Merchant aliases** (tabela `merchant_aliases`)
3. **Exact match prethodnih transakcija** (isti `merchant_raw` → ista kategorija 3+ puta)
4. **Fuzzy match** kroz `pg_trgm` — `merchant_raw % merchants.canonical_name > 0.6`
5. **Embedding similarity** (Faza 3+): `sentence-transformers multilingual MiniLM`, kNN
6. **LLM batch** (Faza 2): Gemini Flash-Lite, 50 transakcija po pozivu
7. **Default: "Ostalo"** + flag `category_confidence = 0, category_source = 'default'`

### 8.2 LLM prompt za kategorizaciju

```
System: Kategoriziraj transakcije iz bankarskog izvoda. Vraćaš isključivo JSON.

User: Za svaku transakciju, vrati najbolju kategoriju iz liste.

Dostupne kategorije:
- hrana-i-pice
- namirnice
- stanovanje
- komunalije
- prevoz
- gorivo
- zdravlje
- ... (sve user-ove kategorije)

Kontekst korisnika (mjesec {month}, {n} transakcija):
[optional: tipični merchanti iz istorije]

Transakcije:
[
  {"id": 1, "merchant": "KONZUM BL", "amount": -4350, "date": "2026-04-15"},
  {"id": 2, "merchant": "BH TELECOM", "amount": -3500, "date": "2026-04-16"},
  ...
]

Vrati:
[
  {"id": 1, "category_slug": "namirnice", "confidence": 0.95},
  {"id": 2, "category_slug": "komunalije", "confidence": 0.98},
  ...
]

Pravila:
- "KONZUM", "BINGO", "MERCATOR", "BIMES" → namirnice
- Operateri (BH Telecom, m:tel, HT Eronet, A1) → komunalije ili pretplate
- Benzinske (Hifa, Petrol, OMV, INA) → gorivo
- Ako si nesiguran, stavi confidence < 0.7 i kategoriju "ostalo".
- Nikad ne izmišljaj slug koji nije u listi.
```

### 8.3 Kontinualno učenje (pravilno)

**Ne treniramo globalni model.** Umjesto toga:

1. Svaka korisnička korekcija ide u `user_corrections`
2. Transakcija s istim `merchant_raw` + različita kategorija nego što je AI predložio = signal
3. Nakon N=3 korekcije istog obrasca, automatski:
   - Kreiraj/update-aj `merchant_aliases` zapis za tog korisnika
   - Opciono: predloži pravilo u `categorization_rules`
4. Kod sljedećeg parsiranja, kaskada hvata kroz alias bez LLM-a → štedi pare, poboljšava tačnost

**Pravilo 🔒:** User correction-i su per-user. Nikad ne koristimo jednog korisnika za poboljšanje drugog osim kroz anonimizirani merchant dictionary (Faza 4+), i to samo uz eksplicitni opt-in.

---

## 9. Deployment Architecture

### 9.1 Environments

| Environment | URL                       | Supabase             | Svrha                  |
| ----------- | ------------------------- | -------------------- | ---------------------- |
| Local dev   | `http://localhost:3000`   | `konto-dev` projekat | Razvoj, feature rad    |
| Preview     | `konto-pr-{n}.vercel.app` | `konto-dev`          | PR reviews, share link |
| Staging     | `staging.konto.ba`        | `konto-staging`      | Manual smoke testing   |
| Production  | `konto.ba` (ili kasnije)  | `konto-prod`         | Live                   |

### 9.2 Deployment workflow

```
feature/* → push → Vercel preview → konto-pr-N.vercel.app
     │
     └─ merge PR → staging grana → staging.konto.ba (auto)
                       │
                       └─ manual promote → main → konto.ba (auto)
```

### 9.3 Migrations

- **Koristimo Supabase CLI migrations** (`supabase migration new ...`)
- Migrations su u `/supabase/migrations/` u repo-u
- CI primjenjuje migrations na staging auto, na prod manualno sa aprovalom (Faza 4+)
- **Pravilo 🔒:** nikad `drop column` u istoj migraciji kad se dodaje nova logika. Dvije faze:
  1. Dodaj novu kolonu, mirror-aj podatke, deploy
  2. Nakon što novi kod je 2 sedmice live, druga migracija brše staru kolonu
- Zero-downtime: sve migrations moraju biti backward-compatible
- **Napomena:** 7 rednih brojeva ima duplikate (00003, 00004, 00009, 00013, 00038, 00039, 00040) od paralelnog razvoja. **NE preimenovati** — Supabase CLI koristi timestamp prefiks za redoslijed izvršavanja; preimenovanje bi pokvarilo `supabase_migrations` tabelu.

### 9.4 Environment variables

```bash
# Public (client-safe)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
NEXT_PUBLIC_SENTRY_DSN=

# Server-only (nikad u client bundle)
SUPABASE_SERVICE_ROLE_KEY=               # 🔒 najvažnija tajna
GEMINI_API_KEY=
MISTRAL_API_KEY=
RESEND_API_KEY=
FX_API_KEY=
ENCRYPTION_MASTER_KEY=                   # 🔒 za bonus enkripciju

# Feature flags
FEATURE_PDF_UPLOAD=false                 # uključi tek u Fazi 2
FEATURE_LLM_CATEGORIZATION=false
FEATURE_INSIGHTS=false
```

### 9.5 Backup & recovery

- Supabase Pro ($25/mj) ima **automatske dnevne backup-e sa 7-dnevnom retencijom**
- Point-in-time recovery (PITR): Faza 3+ kad postane kritično
- **Ručni export jednom mjesečno** u Fazi 0–2: `pg_dump` → enkriptovano na S3/Backblaze
- Recovery drill: barem jednom u 6 mjeseci pokušaj full restore na staging-u

---

## 10. Observability

### 10.1 Logging

- **Strukturisani log-ovi** (JSON) kroz `pino` ili Next.js native
- **Pravilo 🔒:** nikad ne loguj `merchant_raw`, `notes`, `description`, `amount` u kombinaciji s `user_id`
- Log levels: `error`, `warn`, `info`, `debug`
- Produkcija: samo `warn` i `error` idu u Sentry, `info` u Vercel Logs
- Request correlation ID kroz header `x-request-id`

### 10.2 Metrics (Faza 3+)

Custom events kroz PostHog:

- `transaction_created` (props: source, has_category, currency)
- `pdf_uploaded` (props: pages, file_size_kb, bank)
- `pdf_parsed` (props: success, tx_count, duration_ms, cost_cents)
- `category_corrected` (props: source_before, confidence_before)
- `insight_viewed` / `insight_actioned` / `insight_dismissed`

Nikad u event-ima: actual amounts, merchant names, user email. Samo opaque user ID.

### 10.3 Alerts

Faza 3+, kroz Sentry:

- Error rate > 1% u bilo kom endpointu — email
- PDF parsing failure rate > 10% u 24h — email
- Supabase quota > 80% — email

---

## 11. Performance Budgets

Ciljevi koji utiču na arhitekturu:

| Metrika                        | Cilj                 | Mjerenje         |
| ------------------------------ | -------------------- | ---------------- |
| LCP (Largest Contentful Paint) | < 2.5s               | Vercel Analytics |
| TTI (Time to Interactive)      | < 3.5s               | Vercel Analytics |
| Dashboard first load           | < 1.5s after auth    | Custom timing    |
| Transaction list paginated     | < 500ms p95          | PostHog          |
| Quick-add submit               | < 300ms p95          | PostHog          |
| PDF parsing                    | < 30s za 5-str izvod | Custom           |
| Bundle size (client JS)        | < 300KB gzip         | Next build       |

**Mobile-first performance:**

- Svaka stranica prolazi Lighthouse mobile test, cilj ≥ 90 Performance
- Dashboard sa 1000+ transakcija mora biti paginiran (50 po stranici)
- Charts lazy-loaded (dynamic import)
- Images kroz `next/image` sa lazy loading

---

## 12. Scalability Assumptions

Faza 0–4 ciljano (do 1000 korisnika):

- **Monolit Next.js** bez micro services-a
- **Postgres single instance** (Supabase Pro je dovoljan)
- **Vercel Hobby → Pro** tier
- **Pohrana:** ≤ 5GB Storage, ≤ 500MB DB

Skaliranje preporuke (Faza 5+ ili 1000+ korisnika):

- Supabase → Team plan ($599/mj) ili migracija na vlastiti PG
- Dodaj Redis za rate limiting i cache
- Offload parsing na background queue (Inngest, Trigger.dev)
- Read replicas za dashboard queries

**Pravilo:** Ne optimizuj za scale prije 500 aktivnih korisnika. Ispod toga, vertikalno skaliranje (jači plan) je jeftinije od arhitektonske kompleksnosti.

---

## 13. Otvorena pitanja i TBD ⚠️

Ova pitanja treba odlučiti prije kraja Faze 2:

1. **⚠️ BAM u bazi — da li koristimo `'BAM'` ili `'KM'`?** ISO 4217 kod je `BAM`. Prikazujemo kao `KM`. Odluka: internal `BAM`, display `KM`.
2. **⚠️ Ćirilica support za Fazu 4?** Da, ali samo za locale `sr-RS-Cyrl`. Svi seed podaci u latinici, user može prebaciti.
3. **⚠️ Domena:** `konto.ba` može biti zauzeta — provjeriti; alternativa `konto.app`, `konto.io`, `konto.bh`.
4. **⚠️ BAM Currency Board — šta ako se ukine?** Dodaj feature flag `FX_BAM_FROM_API` koji toggle-uje sa hardcoded konstante na API kurs. Trenutno false.
5. **⚠️ PDF retention — 24h je dovoljno?** Istražiti u Fazi 2 da li neki korisnici hoće da zadrže original za audit. Moguća opcija: delete after 24h default, keep 30 days paid tier.
6. **⚠️ OCR jezik za ćirilične izvode** — testirati Mistral OCR vs. PaddleOCR u Fazi 2.
7. **⚠️ Transfer detection tolerancija** — start ±0.5% iznos, ±3 dana; tune u Fazi 2.

---

## 14. Change Log

| Datum      | Verzija | Promjena                                                                                                                                                                                                                                                                              |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-23 | 1.1     | Zabilježene odluke Faze 0–1 u Change Logu (isporuka F1-E7-T2); vidi [decisions/0001-next-supabase-stack.md](./decisions/0001-next-supabase-stack.md), [0002-bigint-for-money.md](./decisions/0002-bigint-for-money.md), [0003-bosnian-routes.md](./decisions/0003-bosnian-routes.md). |
| 2026-04-21 | 1.0     | Inicijalna verzija                                                                                                                                                                                                                                                                    |

### 14.1 Sažetak odluka Faze 0–1 (zapisano u ADR-ovima i ovom dokumentu)

Navedeno je šta je **fiksirano** prije širenja u Fazu 2; detalj u listi [docs/decisions/](./decisions/).

| Tema                     | Odluka (kratko)                                                                                                    | Gdje detaljno                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Aplikacijski stack       | Next.js 15 (App Router) + TypeScript + Vercel; Supabase (Postgres, Auth, kasnije Storage)                          | [ADR 0001](./decisions/0001-next-supabase-stack.md), §3, §3.3 |
| Novac u sistemu          | `bigint` u minor units; nikad float za domenske iznose; BAM↔EUR fiksni odbor                                       | [ADR 0002](./decisions/0002-bigint-for-money.md), §4          |
| Lokalizacija URL-a       | Korisničke rute na bosanskom; shema i kod identifikatori engleski                                                  | [ADR 0003](./decisions/0003-bosnian-routes.md)                |
| Sigurnost podataka       | RLS na svim user-owned tabelama; server actions s Zod; nema “tajnih” operacija iz browsera preko service role      | §5, §6, [02-security-privacy.md](./02-security-privacy.md)    |
| Auth (Faza 0–1)          | Supabase email OTP + magic link; sesija kroz Supabase klijent / SSR; bez SMS MFA u ranoj fazi                      | §2 non-goals, 02                                              |
| Regija hostinga          | EU (Supabase projekat + Vercel regije) kao default za PII ograničenja                                              | §3.2                                                          |
| API obrazac              | Server Actions za mutacije; jedna error taksonomija; klijent ne zove osetljive stvari direktno s service role-om   | §6                                                            |
| Testiranje               | Vitest za poslovnu logiku; integracija na RLS; Playwright za kritične tokove; lokalni Supabase u E2E               | [05-testing.md](./05-testing.md)                              |
| Šema baze                | UUID ključevi; soft delete; `user_id` na vlasničkim redovima; triggeri za balance gdje je definisano u migracijama | §5                                                            |
| Šta namjerno nije u F0–1 | Bank API, investicije, dijeljeni household nalog, PDF parser u produkciji (to je Faza 2+)                          | §2                                                            |
