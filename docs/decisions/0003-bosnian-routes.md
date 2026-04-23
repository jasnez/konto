# ADR 0003: Rute i UI copy na bosanskom; tehnički identifikatori na engleskom

## Status

Prihvaćeno (Faza 0–1)

## Kontekst

- Primarno tržište i korisnik su s **Balkana**; korisnički očekuje lokalizirane, čitljive **URL-ove** i naslove (npr. “transakcije”, ne “transactions” u pathu).
- Kod, tabele, kolone i interni API teže da ostanu **dosljedni** engleskim konvencijama programiranja i Supabase/Postgres praksi.

## Odluka

- **Korisničke rute** (Next.js `app/`) koriste **bosanske / lokalizirane segmente** gdje je to već uvedeno (npr. `/transakcije`, `/pocetna`, `/podesavanja`, `/prijava`) — to je namjerna produktna odluka, ne “privremeni” prevod.
- **Imena tabela, kolona, server actions, TypeScript simboli** ostaju **engleski** (`accounts`, `transactions`, `createTransaction`, …).
- **Formatiranje** valuta, datuma i brojeva koristi **locale** (`bs-BA` gdje je primijenjeno u dizajnu), ne engleski default, osim gdje korisnik eksplicitno bira `en-US`.

## Posljedice

### Pozitivne

- URL-ovi su deljivi i smisleni lokalnom korisniku; bolji SEO u lokalnom jeziku nego generički engleski.
- Baza i kod ostaju čitljivi međunarodnom developeru / alatu.

### Negativne / trade-off

- Miješanje “bs rute / en kod” zahtijeva diskiplinu u navigaciji i testovima (E2E koriste stvarne rute).
- Novi doprinosi moraju provjeriti [dizajn sistem](../03-design-system.md) za copy, ne izmišljati nove rute ad hoc.

## Alternative koje su odbačene

- **Sve na engleskom u URL-u** — konzistentno za developere, ali hladnije za ciljno tržište i manje “lokalno” iskustvo.
- **Sve na bosanskom u kodu** — otežava rad s bibliotekama, primjerima i internacionalnim alatima.

## Povezano

- [../03-design-system.md](../03-design-system.md) — copy i jezik
- [0001-next-supabase-stack.md](./0001-next-supabase-stack.md) — Next rute kao proizvod

## Change log

| Datum      | Izmjena                       |
| ---------- | ----------------------------- |
| 2026-04-23 | Inicijalna verzija (F1-E7-T2) |
