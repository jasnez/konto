# Runbook: backup i restore

**Svrha:** Vratiti korisničke podatke nakon greške, migracije ili gubitka instance. Konto u Fazi 0–1 nema full “one-click restore” u appu; koristi se **JSON izvoz** + **Supabase / Postgres alati**.

---

## 1. Backup (šta imati prije incidenta)

### A) Korisnički JSON (aplikacija)

- U podešavanjima: **Izvoz podataka** → preuzimanje JSON fajla (vidi implementaciju `api/export`).
- Čuvaj fajl **izvan** repozitorija (šifrovani disk, drugi uređaj, cloud sa pristupom samo tebi).
- Ograničenja: rate limit po nalogu (npr. jedan export po satu) — planiraj export prije većih promjena.

### B) Hosting baze (Supabase produkcija)

- Na **Supabase Pro+** uključeni su automatski backup-i (PITR po planu). U Dashboard-u provjeri retenciju i posljednji backup.
- **Ne oslanjaj se** samo na app export za produkciju — backup baze je izvor istine za sve korisnike odjednom.

### C) Lokalni dev (`supabase start`)

- Cijela baza je u Docker volumenu. Prije `supabase db reset` ili brisanja kontejnera:
  - `pg_dump` (vidi niže), ili
  - bar JSON export iz appa za test korisnika.

---

## 2. Dump lokalne Postgres baze (pg_dump)

Kad je stack podignut:

```bash
pg_dump "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Fc -f konto-local-$(date +%Y%m%d).dump
```

Restore u **praznu** lokalnu bazu (oprezno — prepiše podatke):

```bash
pg_restore -d "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --clean --if-exists konto-local-YYYYMMDD.dump
```

Za produkciju koristi **Supabase dokumentaciju** za backup/restore (ne radi `pg_restore` na produkciji bez maintenance prozora i plana).

---

## 3. Restore iz JSON exporta (aplikacijski nivo)

- U Fazi 0–1 **nema** ugrađenog “import everything” iz JSON-a u jedan klik (to je često Faza 2+).
- JSON služi kao **dokaz sadržaja** i za ručni import / skripte kad se doda import feature.
- Nakon restore baze iz `pg_dump`, korisnički nalog i session zavise od `auth` sheme — ne miješaj dump auth.users s produkcijom bez jasnog plana.

---

## 4. Checklist nakon incidenta

1. Utvrdi **šta je izgubljeno** (samo dev? jedan user? cijela instanca?).
2. Uzmi **najnoviji validan backup** (Supabase snapshot / dump / JSON).
3. Na **staging** prvo testiraj restore.
4. Nakon produkcijskog restore-a: provjeri login, jedna transakcija, izvoz, i RLS (korisnik A ne vidi B).

---

## 5. Reference

- [Supabase — Backups & restore](https://supabase.com/docs/guides/platform/backups)
- [01-architecture.md](../01-architecture.md) — sekcija backup & recovery
- [local-setup.md](./local-setup.md) — ako lokalni stack ne starta
