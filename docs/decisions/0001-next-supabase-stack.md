# ADR 0001: Next.js + Supabase + Vercel kao osnovni stack (Faza 0–1)

## Status

Prihvaćeno (Faza 0–1, april 2026)

## Kontekst

- Proizvod je **solo-founder** PFM: treba brz razvoj, jasan hosting model, dobar support u AI alatima (Cursor), i **izolacija podataka po korisniku** bez vlastitog auth servisa od nule.
- Cilj tržišta: EU / Zapadni Balkan — hosting i DB trebaju imati jasnu **EU** priču.
- Nema resursa za microservices, vlastiti Kubernetes, ni kompleksan self-hosted auth u Fazi 0.

## Odluka

- **Frontend + aplikacijski sloj:** [Next.js](https://nextjs.org/) (App Router) na [Vercel](https://vercel.com/) — server komponente, server actions, jedan deploy artifact.
- **Baza, auth, storage (kasnije PDF):** [Supabase](https://supabase.com/) (managed PostgreSQL) s **Row Level Security (RLS)** kao primarnom kontrolom pristupa retcima.
- **Jezik:** TypeScript striktno; validacija ulaza [Zod](https://zod.dev/).

## Posljedice

### Pozitivne

- Jedan repozitorij, jedan mentalni model: “RLS + server actions + Zod” se ponavlja kroz cijeli produkt.
- Supabase daje `auth.users`, spremno za proširenje `profiles` tabelom; nema održavanja vlastitog password store-a u Fazi 0–1.
- Vercel + Next su dobro pokriveni u Cursor/LLM korpusima — manje “izmišljanja” u generisanom kodu.
- Lokalni razvoj: `supabase start` daje realan Postgres + GoTrue, blizu produkcije.

### Negativne / trade-off

- **Vendor lock-in** na Vercel i Supabase (migacija je moguća, ali posao).
- **Edge i regionalnost** treba svjesno konfigurirati (EU regije) — nije “default US”.
- Lokalni stack **zahtijeva Docker** — teži od “samo `npm start`”.

## Alternative koje su odbačene

- **Firebase** — dobar DX, ali lošija SQL/RLS priča za finansijski model i analitiku.
- **T3 / tRPC-only bez Supabase** — više posla oko auth + baze za isti MVP.
- **Django / Rails monolit** — brz backend, ali drugačiji ekosistem od “React-first” PWA plana i veći trenutak učena za solo dev s Cursorom.

## Povezano

- [../01-architecture.md](../01-architecture.md) — sekcija 3 (High-Level Architecture), 9 (Deployment)
- [0002-bigint-for-money.md](./0002-bigint-for-money.md) — kako se novac modeluje iznad Postgresa

## Change log

| Datum      | Izmjena                       |
| ---------- | ----------------------------- |
| 2026-04-23 | Inicijalna verzija (F1-E7-T2) |
