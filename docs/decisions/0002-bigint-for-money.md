# ADR 0002: Novčani iznosi kao `bigint` u minor units (ne `float`)

## Status

Prihvaćeno (Faza 0–1) — **nepregovaro** za domenski kod i šemu (vidi 🔒 u arhitekturi)

## Kontekst

- U finansijskim aplikacijama `number` / `float` u JS-u i `double precision` u SQL-u uzrokuju **zaokruživanja** i teško debugabilne bugove.
- Prikaz u UI (formatiranje, lokalizacija) i **pohrana** (cijeli broj u najmanjoj valutnoj jedinici) su dva različita problem — miješanje vodi u greške.

## Odluka

- Svi korisnički i poslovno relevantni iznosi u bazi i u TypeScript poslovnoj logici predstavljaju se kao **`bigint` u minor units** (npr. feningi za BAM, centi za EUR/USD), osim gdje arhitektura eksplicitno kaže drugačije (npr. FX stopa kao `numeric`).
- Konverzija u string za prikaz radi se **na granici UI** (`Intl.NumberFormat` i sl.), nikad “sačuvaj string u bazi” kao primarni iznos.
- BAM↔EUR na fiksnom odboru: koriste se **konstante** (ne FX API) za taj par, kako je definisano u arhitekturi.

## Posljedice

### Pozitivne

- Deterministička aritmetika; testovi mogu uspoređivati `1234n` umjesto plivajućih stringova.
- Usklađenost s PostgreSQL `bigint` i dobrim RLS/performans pričama za velike tabele transakcija.

### Negativne / trade-off

- `bigint` nije JSON-serializable “iz kutije” u starijim API obrascima — treba **eksplicitno** (string, ili custom) pri exportu/API.
- Developeri moraju znati da `1 KM` = `100n` minor units u ovom modelu (ne miješati s “dinarima bez decimala” mentalnim modelom drugih valuta).

## Alternative koje su odbačene

- **Decimal u bazi, number u JS** — i dalje problemi s IEEE 754 u runtimeu.
- **Sve u stringu (`"12.50"`)** — sporije upite, nejasna aritmetika, teže indeksiranje.
- **Money tip u Postgresu** — korisno, ali dodatna kompleksnost u Supabase/TS clientu u Fazi 0.

## Povezano

- [../01-architecture.md](../01-architecture.md) — sekcija 4 (Monetary Fundamentals)
- [0001-next-supabase-stack.md](./0001-next-supabase-stack.md) — gdje se ovo implementira (Postgres + TS)

## Change log

| Datum      | Izmjena                       |
| ---------- | ----------------------------- |
| 2026-04-23 | Inicijalna verzija (F1-E7-T2) |
