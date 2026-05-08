# ADR 0005: `deleted_at` vs `active` — kada koji obrazac

## Status

Prihvaćeno (Faza 3 / audit 2026-05-08)

## Kontekst

Konto šema mješa dva obrasca za "ova red više nije korisniku vidljiv":

1. **`deleted_at timestamptz`** (Faza 1 i 2 entiteti): `accounts`, `transactions`, `categories`, `merchants`, `parsed_transactions`, `import_batches`, `receipt_scans`, `profiles`. Default `null` znači aktivan; postavljanje vremena ga sakriva. Filtriranje upita: `where deleted_at is null`.

2. **`active boolean`** (Faza 3 entiteti): `budgets`, `goals`, `recurring_transactions`. Default `true` znači aktivan; `false` ga sakriva ali zadržava istoriju za kasnije agregate. Filtriranje: `where active is true`.

Bez eksplicitnog dokumentovanja, novi developer (ili AI agent bez memorije) može naći jedan obrazac, kopirati ga, i nesvjesno razbiti UX onaj-ili-onog drugog.

## Odluka

### Koristi `deleted_at timestamptz` kada:

- Korisnik **briše** zapis i očekuje da ga više nikad ne vidi.
- Brisanje je naturalno terminalan akt; ne treba "vrati u rad" semantika.
- Postoje strane reference (FK) koje moraju nastaviti raditi (npr. `transactions.account_id` mora ostati validan i nakon što je račun "obrisan").
- Audit log ili balance trigger koristi soft-deleted red kao istorijski izvor.

**Filtriranje:** sve hot-path RLS politike i upiti pišu `where deleted_at is null` eksplicitno.

### Koristi `active boolean` kada:

- Korisnik **pauzira/arhivira** zapis i može htjeti da ga ponovo aktivira.
- Istorija pauziranih perioda je vrijedna za UI (npr. "Netflix pretplata, ponovo aktivirana 5. maja").
- Postoji partial unique index na `(user_id, X) WHERE active is true` koji dozvoljava deactivate-and-recreate flow (kao kod `budgets`: jedan aktivan budžet po kategoriji, ali stari budžeti ostaju kao istorija).
- Phase-3 spend kalkulacija filtrira po `active = true` da računa samo trenutne mjesečne/sedmične limite, ali agregati po istoriji ostaju mogući.

**Filtriranje:** sve hot-path upiti pišu `where active is true` eksplicitno.

### Tabela: koja tabela koristi koji obrazac

| Tabela                   | Obrazac      | Razlog                                                                          |
| ------------------------ | ------------ | ------------------------------------------------------------------------------- |
| `accounts`               | `deleted_at` | Brisanje je terminalno; transakcije FK još uvijek pokazuje na ovaj račun.       |
| `transactions`           | `deleted_at` | Brisanje je terminalno; balance trigger koristi istoriju.                       |
| `categories`             | `deleted_at` | Brisanje sistemske kategorije bi razbilo `transactions.category_id`.            |
| `merchants`              | `deleted_at` | Brisanje sa cascade na merchant_aliases bi izgubilo learned mapping-ove.        |
| `parsed_transactions`    | `deleted_at` | Privremeno staging; soft-delete je zato što finalize_import može da pukne.      |
| `import_batches`         | `deleted_at` | Audit-trail uvoza.                                                              |
| `receipt_scans`          | `deleted_at` | OCR scan istorija.                                                              |
| `profiles`               | `deleted_at` | GDPR delete-flow (soft → hard nakon 30 dana cooldown-a).                        |
| `budgets`                | `active`     | Deactivate-and-recreate flow + istorijski period-spent analitika.               |
| `goals`                  | `active`     | Pauziranje cilja je legitiman UX (privremeno preusmjeravanje fondova).          |
| `recurring_transactions` | `active`     | Pauziranje pretplate ne smije izgubiti detection signal za buduće reaktivacije. |

## Posljedice

### Pozitivne

- Jasna odluka prevenira drift: novi entiteti idu u tačno jedan obrazac.
- RLS politike i upiti su konzistentni unutar svoje grupe.
- Phase-3 features mogu dati istoriju ("budžet u martu je bio 1000 KM, sad je 1200 KM") jer arhivni redovi ostaju u tabeli.

### Negativne / trade-off

- Svaki upit mora znati koji flag tabela koristi. Nepročišćeno = silent UX bug (npr. izlistanje izbrisanih budžeta u dropdown-u).
- Cross-table joinovi (npr. `budgets` + `transactions` za period-spent) moraju kombinovati `where b.active is true and t.deleted_at is null`.

### Pravila za novu tabelu

Pre nego što se doda novi mutable entitet:

1. Ako je brisanje terminalno → `deleted_at`.
2. Ako je pauziranje legitiman UX → `active`.
3. Mješavinu (npr. i pauziranje i brisanje) — koristi oba kolone, ali to je signal da entitet vjerovatno mora da se razdvoji u dvije tabele.

## Alternative koje su odbačene

- **Samo `deleted_at`** — gubi pause-and-resume UX za Phase 3 features (budžeti, ciljevi, pretplate); previše destruktivno za stvari koje korisnik vidi kao "privremeno isključeno".
- **Samo `active`** — komplikuje cascade brisanje (ne možeš ostaviti soft-deleted račun ako mu je `active = false` pa imaš FK reference dileme).
- **Custom `status` enum kolona** — više kompleksnosti za indeks/RLS po cijenu marginal beneficija.

## Povezano

- `supabase/migrations/20260422084709_00001_initial_schema.sql` — uvodi `deleted_at` na `accounts`, `categories`, `transactions`.
- `supabase/migrations/20260610120000_00053_budgets.sql` — uvodi `active` na `budgets` (vidi komentar u headeru o partial unique index).
- `supabase/migrations/20260613120000_00056_recurring_transactions.sql` — uvodi `active` na recurring.
- `supabase/migrations/20260615120000_00058_goals.sql` — uvodi `active` na goals.

## Change log

| Datum      | Izmjena                                                               |
| ---------- | --------------------------------------------------------------------- |
| 2026-05-08 | Inicijalna verzija (DB.3 iz Supabase architecture audit-a 2026-05-08) |
