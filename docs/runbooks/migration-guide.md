# Runbook: dodavanje SQL migracije

**Svrha:** Sigurno promijeniti šemu (`public`, `auth` reference) u skladu s Konto konvencijama: verzionisane migracije, RLS, backward compatibility gdje je moguće.

---

## 1. Preduslovi

- [Supabase CLI](https://supabase.com/docs/guides/cli) instaliran (`pnpm` već povlači bin).
- Lokalno: `pnpm supabase:start` radi; `pnpm supabase:reset` primjenjuje migracije čisto.

---

## 2. Nova migracija

Iz root repozitorija:

```bash
pnpm exec supabase migration new kratki_opis_snake_case
```

Npr. `supabase migration new add_column_foo_to_accounts`

- Otvori generisani fajl u `supabase/migrations/`.
- Piši **idempotentne** korake gdje ima smisla (`if not exists`, posebne provjere).
- **RLS:** svaka nova tabela mora imati politike u skladu s [01-architecture.md](../01-architecture.md); ne ostavljaj tabelu otvorenu po defaultu.

---

## 3. Primjena lokalno

```bash
pnpm supabase:reset
```

- Ovo rekreira lokalnu bazu, primijeni **sve** migracije redom i pokrene `supabase/seed.sql` ako postoji.
- Ako nešto pukne, ispravi SQL i ponovi.

Zatim regeneriši TypeScript tipove (ako je skripta podešena):

```bash
pnpm supabase:types
```

---

## 4. PostgREST / odmor keša

- Ponekad nakon `alter table` PostgREST treba trenutak u novom containeru. Ako vidiš greške tipa “schema cache” nakon migracije, restartuj lokalni stack: `pnpm supabase:stop` pa `pnpm supabase:start`, ili vidi migracije koje sadrže `notify pgrst` (ako projekat to koristi).

---

## 5. Produkcija / udaljeni projekat

- **Povezivanje:** `supabase link --project-ref <ref>` (jednom).
- **Deploy migracija:** `supabase db push` ili kroz CI po projekat konvenciji.
- **Nikad** ne edituj ručno prošle migracije koje su već deploy-ane — uvijek nova migracija za ispravke.

---

## 6. “Zero downtime” principe (sažetak)

- Izbjegavaj `drop column` u istom koraku u kojem stari kod još očekuje kolonu.
- Dvostepeni rollout: (1) dodaj kolonu, popuni, deploy koda, (2) ukloni staro polje u kasnijoj migraciji.

Detalj: [01-architecture.md — sekcija 9.3 Migrations](../01-architecture.md).

---

## 7. Poznate anomalije u historiji migracija

### Duplirani redni brojevi (`00003`, `00004`)

Nekoliko migracija dijeli isti kratki broj u imenu fajla:

| Timestamp      | Ime fajla                            |
| -------------- | ------------------------------------ |
| 20260422200000 | `00003_opening_balance_category.sql` |
| 20260422223632 | `00003_simplify_currency_locale.sql` |
| 20260423170000 | `00003_fx_rates.sql`                 |
| 20260423000000 | `00004_opening_balance_category.sql` |
| 20260423193000 | `00004_dashboard_rpc.sql`            |

**Zašto:** Supabase CLI primjenjuje migracije po **timestamp** redoslijedu, a ne po `000N` sufiksu. Kratki broj je samo konvencija za čitljivost, nije dio mehanizma primjene. Duplikati nastaju kad se isti `supabase migration new` pozove više puta ili kad se migracija retroaktivno napravi da bi se local i remote sinhronizirali.

**`20260423000000_00004_opening_balance_category.sql`** je namjerni **no-op** (`select 1;`): kategorizacija "Početno stanje" je već bila na remote bazi iz prethodne migracije (`20260422200000`); ova migracija postoji samo kako bi `db reset` na svakom okruženju prošao čisto bez greške.

**Pravilo za buduće migracije:** Koristi timestamp koji generira CLI (`supabase migration new`). Kratki sufiks (`_000N_`) je slobodan opis — nikad ne treba biti jedinstven. Ako slijedeća migracija bude imala sufiks `00020`, to je ispravno.

---

## 8. Reference

- [Supabase — Database migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [01-architecture.md](../01-architecture.md) — data model, RLS

---

## 9. Rollback strategija (PR-3)

Konto-ova migracijska disciplina je **additive-only** (nove tabele/kolone/indeksi, retka DROP). To pokriva 90% slučajeva, ali kad rollback **ipak** treba — npr. produkcijski incident sat nakon push-a — postoje tri stvarna alata:

### 9.1 Supabase PITR (preferirano)

Supabase **Pro** plan ima **7-day Point-in-Time Recovery**. Ovo je najjeftinija strategija za gotovo svaku grešku migracije:

1. Otvori Supabase Dashboard → Database → **Backups** → **Restore**.
2. Odaberi tačan timestamp (do 1 minute precision) **prije** push-a.
3. Restore stvara novu instancu sa starim šemom + podacima — možeš je promovisati ili koristiti za diff/recovery.

**Ograničenja:**

- Free plan nema PITR — samo dnevni snapshot. Beta korisnici (5 osoba) su na Free-u; rollback prozor je **24h najgore**, što je obično dovoljno.
- Restore **briše** podatke unesene nakon timestamp-a. Komuniciraj sa korisnicima ako se bilo šta gubi.

### 9.2 Reverse migracija (forward-only fix)

Konto **ne piše** down-migracije. Umjesto toga, ako reverse treba bez PITR-a:

1. Napiši **novu** migraciju koja poništava efekat (npr. `00072 add column → 00073 drop column`).
2. Push-aj kroz isti workflow kao i originalnu (Section 5 ovog dokumenta).
3. Označi originalnu migraciju kao "superseded" u commit poruci nove.

Prednost: ostaje audit trail u `schema_migrations`. Mana: ako su podaci unesni u međuvremenu pomoću nove kolone, gube se.

### 9.3 Per-migration rollback notes

Migracije sa stvarnim rollback rizikom (per audit 2026-05-07):

#### `00042_audit_log_drop_fk.sql`

- **Akcija:** Drop foreign-key constraint na `audit_log.user_id`.
- **Rollback rizik:** Re-dodavanje FK može fail-ovati ako su `null`/sirote vrijednosti unesene nakon drop-a.
- **Strategija:** Ako moraš restore, prvo SELECT broji `null`/orphan rows; ako > 0, izbriši ili re-pridruži prije ADD CONSTRAINT.

#### `00043_cleanup_parsed_tx_on_terminal.sql`

- **Akcija:** Dodaje trigger koji briše `parsed_transactions` kad je import batch terminal.
- **Rollback rizik:** Sam trigger se trivijalno DROP-uje, **ali već obrisani parsed_transactions su izgubljeni**. Re-runtime parsing sirovog PDF-a je jedini put nazad.
- **Strategija:** PITR je jedini način da povratiš obrisane parsed_tx redove.

#### `00066_backfill_missing_profiles.sql`

- **Akcija:** Backfilluje nedostajuće `profiles` redove za postojeće `auth.users`.
- **Rollback rizik:** Down-migracija ne može razlikovati "backfilled-by-this-migration" od "manually-created-after". Nema markera.
- **Strategija:** Ako rollback treba, izlistaj `auth.users` koji nemaju aktivnost prije migracije timestamp-a, pa obriši njihove `profiles` ručno. Realnije: PITR.

### 9.4 Pre-deploy checklist (za bilo koju migraciju)

- [ ] Lokalno: `pnpm supabase:reset` prošao bez greške.
- [ ] Lokalno: smoke test svih affected query-ja (npr. `select count(*) from new_table`).
- [ ] Provjeri u kodu da li bilo koja Server Action / RPC zavisi od **stare** šeme — ako da, deploy-aj **kod prvo** sa backwards-compat handlanjem, **pa migraciju**.
- [ ] Ako je migracija destruktivna (DROP, ALTER TYPE non-additive, RENAME) — **eksplicitno** spomeni u PR opisu i provjeri PITR window.
- [ ] Push migraciju u **slot vremena niskog prometa** (rana jutra UTC za BiH korisnike).
- [ ] Drži Dashboard → Logs otvoren prvih 5 minuta nakon push-a.
- [ ] Ako nešto pukne: **prvo pokušaj forward-fix** (Section 9.2), tek onda PITR.

### 9.5 Šta NE raditi

- ❌ Ne zovi `supabase db reset` na produkciji. Ovo briše sve tabele.
- ❌ Ne edituj `supabase_migrations.schema_migrations` osim history-only marker insert-a (vidi Section 5). Brisanje reda iz te tabele nije rollback — to je samo prikrivanje.
- ❌ Ne radi `DROP DATABASE` ako nemaš testirani PITR backup.
