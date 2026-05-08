# ADR 0006: Numeracija migracija — duplikati u istoriji i pravila za naprijed

## Status

Prihvaćeno (audit 2026-05-08) — **dokumentuje postojeće stanje, ne mijenja istoriju**

## Kontekst

Migracije u `supabase/migrations/` imaju dvostruku oznaku:

```
YYYYMMDDHHMMSS_NNNNN_short_description.sql
└── timestamp ──┘ └sek┘ └─────── opis ─────────┘
```

Postgres + Supabase CLI primjenjuju migracije u **redoslijedu po cijelom imenu fajla** (timestamp dominira). Sekvencijski broj `NNNNN` je _prevashodno radne dokumentacije_ — pomaže developeru da kaže "vidi 00038" umjesto "20260526150000".

Tokom Faze 0–2 razvoj je tekao paralelno na više grana. To je proizvelo **duplikate sekvencijskih brojeva** kada su se grane spojile:

| Sekv. # | Fajlovi (po vremenu)                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00003` | `20260422200000_00003_opening_balance_category.sql`, `20260422223632_00003_simplify_currency_locale.sql`, `20260423170000_00003_fx_rates.sql`                                                         |
| `00004` | `20260423000000_00004_opening_balance_category.sql`, `20260423193000_00004_dashboard_rpc.sql`                                                                                                         |
| `00009` | `20260423210500_00009_transactions_merchant_fk.sql`, `20260423220000_00009_profiles_deleted_at.sql`                                                                                                   |
| `00013` | `20260424140000_00013_account_balance_trigger.sql`, `20260425100000_00013_backfill_default_categories.sql`                                                                                            |
| `00038` | `20260526150000_00038_rls_auth_initplan_and_function_search_path.sql`, `20260527120000_00038_dashboard_exclude_opening_balance_from_flow.sql`                                                         |
| `00039` | `20260527130000_00040_import_batches_enqueued_status.sql` ← _broj `00040` na grani A_, `20260528120000_00039_fx_rate_numeric_rpc.sql` ← _broj `00039` na grani B_ (rename ne mijenja stanje istorije) |
| `00040` | `20260529120000_00040_transfer_pair_symmetry.sql` plus duplicat iz `00039`                                                                                                                            |

Postgres se ne plaši ovih duplikata — primjenjuje ih po timestamp-u, što je jednoznačno. **Praktične posljedice:**

1. **Čovjek-pretraga**: `grep "00038" supabase/migrations/` vraća dva fajla. Nepoznavanje konteksta → razgovor o pogrešnoj migraciji.
2. **AI-pretraga**: Agenti koji se oslanjaju na sekvencijski broj kao identifikator mogu da pomiješaju verzije.
3. **Rebase merge konflikti**: kada nove grane dolaze sa istim sljedećim brojem, ručno reševavanje zahtjeva da se odluči redoslijed.

## Odluka

### Za istoriju (ono što je već u repo-u i u produkcionoj `supabase_migrations.schema_migrations` tabeli)

**Ne mijenjati.** Preimenovanje fajlova bi razbilo Supabase migration state na produkciji (CLI prati primjenjene migracije po imenu fajla; rename = nepoznata migracija). ADR 0006 fiksira kanonsko mapiranje:

```
00003a = opening_balance_category (20260422200000)
00003b = simplify_currency_locale (20260422223632)
00003c = fx_rates                 (20260423170000)

00004a = opening_balance_category (20260423000000) — backfill verzija od 00003a
00004b = dashboard_rpc            (20260423193000)

00009a = transactions_merchant_fk (20260423210500)
00009b = profiles_deleted_at      (20260423220000)

00013a = account_balance_trigger        (20260424140000)
00013b = backfill_default_categories    (20260425100000)

00038a = rls_auth_initplan_and_function_search_path (20260526150000)
00038b = dashboard_exclude_opening_balance_from_flow (20260527120000)

00039a = import_batches_enqueued_status (20260527130000) ← fajl ima `_00040_` u imenu (rename greška na grani A; suffix istorija)
00039b = fx_rate_numeric_rpc            (20260528120000)

00040a = transfer_pair_symmetry         (20260529120000)
```

Kada se u review-u ili razgovoru pominje "00038", _uvijek_ pojasni koji (a/b).

### Za nove migracije (od `00071` nadalje)

**Pravilo:** nikad ne reupotrebljavati sekvencijski broj. Sljedeća dostupna sekvenca se određuje:

```bash
ls supabase/migrations/ | awk -F_ '{print $2}' | sort -u | tail -1
```

Pa se uveća za 1 (sa zero-pad-om na 5 cifara).

Timestamp se generiše s monotonim offset-om (svaki sljedeći fajl dobija naredni dan u istom satu, npr. `20260628120000`, `20260629120000`...). Ne treba da bude realan datum — samo monotonijo rastući.

### CI guard

Husky pre-commit hook (već postoji) treba proširiti sa skriptom koja pada kada novi migration fajl ima sekvencijski broj koji već postoji:

```bash
new_seq=$(echo "$new_migration" | awk -F_ '{print $2}')
if grep -q "_${new_seq}_" supabase/migrations/*.sql 2>/dev/null; then
  echo "ERROR: Migration sequence number ${new_seq} already exists."
  exit 1
fi
```

(Implementacija ovog guard-a je posebna stavka — vidi roadmap.)

## Posljedice

### Pozitivne

- Istorijski duplikati su sada eksplicitno dokumentovani; pretraga "koji 00038" ima jednoznačan odgovor.
- Pravilo za naprijed sprečava nove duplikate.
- Niko ne pokušava da preimenuje produkcione migracije (i razbije CLI).

### Negativne / trade-off

- Suffix-ovi (`00038a`, `00038b`) postoje samo u dokumentaciji, ne u stvarnim imenima fajlova. Mali kognitivni teret.
- CI guard je TODO; dok ne ide, nove duplikate se hvataju ručno u review-u.

## Alternative koje su odbačene

- **Preimenovati postojeće fajlove**: razbija produkcionu migration state. Apsolutno ne.
- **No-op migration koji "rename" event-uje**: Postgres nema "rename migration filename" semantiku. Nemoguće.
- **Ignore problem**: dovelo bi do još više kolizija; AI agenti i grep-ovi bi se sve više zbunjivali.

## Povezano

- [`supabase/migrations/`](../../supabase/migrations/) — fajlovi sa duplim sekvencama.
- [`docs/runbooks/migration-guide.md`](../runbooks/migration-guide.md) — operativni vodič za pisanje migracija.

## Change log

| Datum      | Izmjena                                                                |
| ---------- | ---------------------------------------------------------------------- |
| 2026-05-08 | Inicijalna verzija (OPS.1 iz Supabase architecture audit-a 2026-05-08) |
