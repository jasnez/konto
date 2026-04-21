# Konto — Projektna dokumentacija

**Verzija:** 1.0 · **Datum:** april 2026.

Ovo je kompletna projektna dokumentacija za **Konto** — PFM (personal finance management) aplikaciju za Zapadni Balkan, s primarnim fokusom na **BiH (BAM/EUR)** i sekundarno Srbija, Crna Gora, Makedonija.

Dokumentacija je organizovana u 6 dokumenata — namijenjena **tebi kao foundera + Cursoru kao izvršnom agentu**. Svaki dokument ima jasnu svrhu; čitaj ih redom prvi put, referiraj se kasnije po potrebi.

---

## Kako čitati ovu dokumentaciju

### Prvi put (preporučen redoslijed)

1. **00-README.md** — ovaj dokument (5 minuta)
2. **[01-architecture.md](./01-architecture.md)** — šta gradiš i zašto tako (60–90 minuta, čitaj pažljivo)
3. **[02-security-privacy.md](./02-security-privacy.md)** — ne-pregovaračka pravila sigurnosti (30 minuta)
4. **[03-design-system.md](./03-design-system.md)** — vizualni jezik i UX obrasci (30 minuta)
5. **[04-cursorrules.md](./04-cursorrules.md)** — pravila saradnje s Cursorom (20 minuta)
6. **[05-testing.md](./05-testing.md)** — testing strategija (20 minuta)
7. **[06-backlog.md](./06-backlog.md)** — backlog po fazama/epicima/taskovima (referiraj task-po-task)

**Ukupno:** ~3–4 sata za prvo čitanje. Preporučujem ne raditi to u jednom dahu — razdvoji na 2 sesije.

### Kasnije (za rad)

- **Pišeš novu feature?** Otvori `06-backlog.md`, nađi task, daj Cursoru full task tekst + reference.
- **Sumnjaš u sigurnost?** `02-security-privacy.md` sekcija "Things We Will Never Do".
- **Kako treba izgledati?** `03-design-system.md` + `src/components/ui` kad bude postojao.
- **Cursor daje loš kod?** Provjeri da `.cursorrules` iz `04-cursorrules.md` postoji u root repo-a.
- **Kako testirati monetarni bug?** `05-testing.md` sekcija "Monetary math".

---

## Pregled dokumenata

### [01 — Arhitektura i Data Model](./01-architecture.md)

Temeljni tehnički dokument. Pokriva:

- Vision, constraints, non-goals
- High-level arhitektura (klijent ↔ Vercel ↔ Supabase ↔ LLM)
- Regionalnost (EU hosting, ne-US procesiranje)
- Tech stack tabela s verzijama i obrazloženjima
- **Monetary fundamentals** — bigint cents, multi-currency, BAM Currency Board (1 EUR = 1.95583 BAM)
- **Kompletna Postgres shema** — sve tabele, tipovi, indeksi, **RLS policije**, triggeri
- Seed podaci (kategorije za BiH, merchant rječnik)
- API design (Server Actions pattern, error taxonomy)
- PDF parsing pipeline (arhitektura, ne implementacija — to je u 06)
- Kategorizacijska kaskada (rules → alias → fuzzy → history → LLM)
- Deployment, observability, performance budgets, scalability
- 7 otvorenih arhitektonskih pitanja (odgovori ih kako dolazi vrijeme)

**Kad čitati:** Prije nego napišeš ijednu liniju koda. Kasnije, kad god mijenjaš šemu.

### [02 — Security & Privacy](./02-security-privacy.md)

Ne-pregovaračke sigurnosne odluke. Pokriva:

- Security philosophy (5 principa)
- Threat model (akteri, assets, attack scenarios koji se brane vs ne brane)
- Authentication (magic link Faza 0–1, passkey Faza 2–3, nikad SMS)
- Session management, authorization (RLS kao osnova, defense in depth)
- Encryption (TLS, AES-256, envelope encryption, PDF 24h retention)
- **LLM prompt handling** — PII redaction prije slanja
- **GDPR compliance** — legal bases, data subject rights, DPA lista, BiH Zakon o zaštiti ličnih podataka (okt 2025)
- Security hardening checklist (CSP headers, secrets, CI/CD, monitoring)
- Incident response plan
- "Things We Will Never Do" lista (čitaj ovo prvo kad te napadne lijenost)

**Kad čitati:** Prije Faze 0 (hardening od početka). Prije svake security-critical feature (označena 🔒).

### [03 — Design System](./03-design-system.md)

Vizualni jezik aplikacije. Pokriva:

- Design principles (dark-first, mobile-first, edit-friendly, kalibrisano minimalizam)
- Color tokens (CSS vars, dark i light mode)
- Typography skala
- Spacing, radius, shadows
- Komponent inventar (sve shadcn/ui + custom)
- **MoneyInput** specifikacija (kritična komponenta)
- **Mobile patterns** — bottom nav, sticky quick-add, swipe actions
- Copy guide (bosanski ton i stil)
- Accessibility checklist
- Ikone (lucide-react selekcija)
- Animation tokens

**Kad čitati:** Kad god gradiš UI komponentu. Kad Cursor napiše "stilizovanu" komponentu koja izgleda generic — vrati ga ovom dokumentu.

### [04 — Cursor Rules & Workflow](./04-cursorrules.md)

Saradnja s AI agentima (prvenstveno Cursor). Pokriva:

- **Sadržaj `.cursorrules` fajla** — kopiraj u root repo-a, to je kontekst koji Cursor čita prije svake akcije
- Coding standards (strict TS, no `any`, imports order, naming)
- **Obavezne pattern-e** — Zod validacija, bigint za novac, RLS check u svakom Server Actionu, FX handling
- **Zabranjene pattern-e** — float za novac, raw SQL bez sanitize, console.log u produkciji, direct DB iz komponenti
- File structure konvencije
- Test-first workflow
- Commit message format
- **Kako pisati Cursor prompt-ove** — struktura, kontekst, primjeri
- Kako preuzeti task iz backloga i dati ga Cursoru

**Kad čitati:** Prije setup-a Cursora. Kad god Cursor "improvizuje" nešto što nije po pravilima.

### [05 — Testing Strategy](./05-testing.md)

Šta testirati, kako, i kada. Pokriva:

- Testing pyramid za ovaj projekat
- Alati (Vitest + Playwright + MSW)
- **Kritični test slučajevi** (ovi moraju PASS-irati uvijek):
  - Monetary math (bigint, zaokruživanje)
  - FX konverzija
  - RLS enforcement (multi-user izolacija)
  - Dedup logic
  - Parser accuracy (F1 ≥ 0.90)
- Coverage targeti po sloju (server actions 90%, UI 60%)
- Fixtures (anonimizirani PDF-ovi)
- CI test matrix
- Manualni QA checklists per feature

**Kad čitati:** Prije pisanja prvog testa. Kad se pita "da li ovo treba test?" (odgovor: skoro uvijek DA za server actions, obavezno za monetary i RLS).

### [06 — Backlog (Epics, Features, Tasks)](./06-backlog.md)

**Najduži dokument. Operativni srž.**

Struktura:
- Faza 0 (fondacija) — 7 epica, ~20 taskova
- Faza 1 (manual MVP) — 7 epica, ~20 taskova
- Faza 2 (PDF parser) — 6 epica, ~20 taskova
- Faza 3 (insights) — 6 epica, ~15 taskova
- Faza 4 (beta users) — 5 epica, ~15 taskova

Svaki task ima:
- Jedinstveni ID (npr. `F2-E3-T1`)
- Oznake (🔒 🧪 🎨 ⚡ 📚 📋)
- Kontekst / referencu na druge dokumente
- **Direktan Cursor prompt** (ne user story — gotov tekst za copy-paste)
- Acceptance kriteriji (checkbox lista)

**Kad čitati:** Task-po-task. Ne čita se u jednom dahu.

---

## Principi dokumentacije

Ova dokumentacija poštuje sljedeće:

1. **Autoritativna, ne vague.** Brojevi, verzije, specifični alati. Ako nešto piše "~" ili "možda", to je pretpostavka koju treba validirati (označeno ⚠️).

2. **Non-negotiable markeri.** 🔒 pravila se ne krše osim ako arhitekturu mijenjamo cijelim dokumentom (v2.0).

3. **Žive dokumente.** Change log na kraju svakog fajla. Kad mijenjaš arhitekturu, ažuriraj dokument i bump verziju.

4. **Sve-u-jednom repo.** Ovaj folder ide u `/docs` unutar Konto repo-a. Commit-ovi dokumentacije su first-class (ne gurnuti u zadnji trenutak).

---

## Šta NIJE u ovoj dokumentaciji

Eksplicitno nije pokriveno:

- **Deployment/DevOps detalji** (Vercel + Supabase setup je lagan, wizard-driven; detaljno rješenje će biti u Fazi 4 ako zatreba).
- **Monetizacija i pricing** — ovo je strateška odluka za Fazu 5, ne za kod.
- **Mobilna native aplikacija** — Faza 5+, tada ćemo dodati `07-mobile.md`.
- **Marketing i launch plan** — nije tehnička dokumentacija.
- **Stratergijska analiza tržišta i konkurencije** — ta je urađena odvojeno u fazi planiranja.

---

## Kontakt i vlasništvo

- **Vlasnik projekta:** Solo founder (ti).
- **Primarno tržište:** BiH.
- **Dokumentacija autor:** Claude (Anthropic), april 2026.
- **Revizije:** Svaka verzija ima change log. Major bump (v2.0) kad se arhitekturni principi mijenjaju.

---

## Kako dati feedback na dokumentaciju

Ako nešto fali, krije istinu, ili je kontraditkcija između dokumenata:

1. Označi direktno u fajlu (komentar ` <!-- TODO: ... --> `)
2. Dodaj u "Otvorena pitanja" sekciju relevantnog dokumenta
3. Rezolviraj prije početka nove faze

Dokumentacija nikad nije "gotova" dok traje razvoj. Ali u ovoj tački, sadrži dovoljno da se krene u Fazu 0 s jasnom glavom.

**Sretno. Konto će se praviti.**

---

## Change Log

| Datum | Verzija | Promjena |
|---|---|---|
| 2026-04-21 | 1.0 | Inicijalna verzija — svih 6 dokumenata kompletirana |
