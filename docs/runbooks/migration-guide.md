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

## 7. Reference

- [Supabase — Database migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [01-architecture.md](../01-architecture.md) — data model, RLS
