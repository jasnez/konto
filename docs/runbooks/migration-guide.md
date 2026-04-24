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
