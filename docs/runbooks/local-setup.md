# Runbook: lokalni setup i uobičajeni problemi

**Svrha:** Brzo riješiti “ne radi mi lokalno” prije nego potrošiš sate na pogrešnu pretpostavku.

---

## 1. Hardverski / softverski minimum

- **Docker Desktop** (Windows / macOS) mora raditi; WSL2 backend na Windowsu je uobičajen.
- **Node LTS** + **pnpm** (vidi root `README.md`).
- **Slobodni portovi** (default Supabase lokalno):
  - `54321` — API
  - `54322` — Postgres
  - `54323` — Studio
  - `54324` — Mailpit

Ako nešto drugo sluša te portove, `supabase start` će fail-ovati ili mapirati druge portove — provjeri `supabase status`.

---

## 2. `supabase start` ne uspijeva

| Simptom                      | Šta provjeriti                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| “Cannot connect to Docker”   | Docker Desktop je li pokrenut? `docker ps` radi?                                                      |
| Port in use                  | Zatvori druge instance Supabase / postgres na istim portovima; ili `supabase stop` u drugom projektu. |
| Stari volumen u lošem stanju | `supabase stop --no-backup` pa `supabase start` (pazi: gubi lokalne podatke u tom stacku)             |

---

## 3. Next.js ne vidi env varijable

- Fajl mora biti **`.env.local`** ili **`.env.development.local`** (ovisno o `NODE_ENV` i Next pravilima).
- Varijable koje počinju s `NEXT_PUBLIC_` idu u klijent; ostale samo na serveru.
- Nakon izmjene `.env*`, **restartuj** `pnpm dev`.

---

## 4. Auth / magic link lokalno

- Email ne ide u pravi inbox — ide u **Mailpit** (`http://127.0.0.1:54324`).
- **Site URL** u Supabase (lokalno u `config.toml` ili Studio) mora biti usklađen s URL-om na kojem ti Next radi (npr. `http://localhost:3000`).
- **Redirect URLs** moraju dozvoliti callback rute (često `/**` wildcard u Dashboard-u).

---

## 5. Baza prazna ili “ne vidim tabele”

- Pokreni `pnpm supabase:reset` da primijeniš migracije + seed.
- Ako SQL pukne u sredini, cijeli reset se vraća — ispravi migraciju, ponovo reset.

---

## 6. Typecheck / `supabase/types` ne odgovaraju bazi

- Nakon migracije: `pnpm supabase:types` (ili kako je u `package.json`).
- Ako types generisanje pukne, provjeri da li lokalni DB radi i da li `supabase/migrations` prolazi.

---

## 7. E2E (Playwright) i Supabase

- E2E očekuje lokalni stack i ispravne env varijable; vidi `playwright.config.ts` i [05-testing.md](../05-testing.md).
- Ako testovi puknu na “RLS / PGRST”, često je potreban `supabase db reset` nakon pull-a novih migracija.

---

## 8. Windows specifično

- Koristi **PowerShell 7+** ili **Git Bash** za skripte koje koriste `&&` ako stari PowerShell javlja grešku.
- Ako `pnpm` nije u PATH, koristi `corepack enable` ili globalni install pnpm po dokumentaciji.

---

## 9. Gdje dalje

- [backup-restore.md](./backup-restore.md) — prije `db reset` na mašini s podacima koje ne želiš izgubiti
- [migration-guide.md](./migration-guide.md) — kako pravilno dodati migraciju
- [01-architecture.md](../01-architecture.md) — arhitektura i okruženja
