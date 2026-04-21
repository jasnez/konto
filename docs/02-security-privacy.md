# Konto — Security & Privacy

**Verzija:** 1.0 · **Datum:** april 2026.
**Status:** Žiti dokument. Svaki sigurnosni incident, pentest finding, ili regulatorna promjena triggeruje ažuriranje.

---

## 1. Security Philosophy

**Pet principa nepregovarivo:**

1. **Defense in depth.** RLS + aplikaciona autorizacija + input validacija + output escaping. Nikad se ne oslanjaj na jedan sloj.
2. **Minimize trust surface.** Najmanji broj ljudi/servisa ima pristup najosjetljivijim podacima. Service role key samo u server funkcijama, nikad u klijentu.
3. **Pretpostavi proboj.** Dizajniraj kao da će baza curiti — šta štiti korisnika? Enkripcija, minimalizacija, efemerni fajlovi.
4. **Iskreno komuniciraj.** Ako ne radimo E2EE, ne tvrdimo da radimo. "Mi vidimo ovo, ne vidimo ono" je strategija.
5. **Privacy by default, ne opt-in.** Analytics opt-out po defaultu, minimum kolačića, minimum eksternog JS-a.

---

## 2. Threat Model

### 2.1 Akteri i motivi

| Akter                                             | Motiv                                    | Vjerovatnoća      | Impact                   |
| ------------------------------------------------- | ---------------------------------------- | ----------------- | ------------------------ |
| Casual attacker (bot)                             | Automatizovani scan, credential stuffing | Visoka            | Nizak ako osnovno radimo |
| Motivisani napadač (npr. bivši partner korisnika) | Pristup finansijama određene osobe       | Niska             | Visok                    |
| Insajder (ti sam u rage quit-u)                   | Krađa baze, brisanje                     | Mala, ali postoji | Katastrofa               |
| Vendor compromise (Supabase, Vercel)              | Supply chain                             | Niska             | Visok                    |
| LLM provider data leak                            | Model pamti PII                          | Srednja           | Srednji                  |
| Regulator / policija                              | Legalni zahtjev za podatke               | Vrlo niska        | Različito                |
| Korisnik sam sebi                                 | Gubi pristup accountu, greške            | Visoka            | Nizak do srednji         |

### 2.2 Assets i njihova klasifikacija

| Asset                                  | Klasifikacija                    | Retention                |
| -------------------------------------- | -------------------------------- | ------------------------ |
| Email adresa                           | PII                              | Dok god nalog postoji    |
| Magic link tokeni                      | Secret                           | 15 min                   |
| `auth.users` row                       | PII                              | Dok god nalog postoji    |
| Transakcije (iznos + merchant + datum) | PFI (personalno finansijski)     | Dok god nalog postoji    |
| PDF izvodi (original)                  | PFI + potencijalno IBAN-i, imena | **≤24h** 🔒              |
| Kategorije, tagovi, notes              | PFI                              | Dok god nalog postoji    |
| Audit log                              | Sigurnosno relevantno            | 90 dana rolling          |
| Analytics events                       | Aggregated, neidentifikovano     | Koliko PostHog retention |
| FX rates                               | Public                           | Neograničeno             |
| Seed merchant dictionary               | Public                           | Neograničeno             |

### 2.3 Attack scenarios koje aktivno braniomo

- **Credential stuffing na magic link endpoint** — rate limiting 3/sat/email, CAPTCHA nakon 2. pogrešnog pokušaja
- **Enumeration attack** (da li postoji korisnik X) — identičan odgovor bez obzira postoji li email
- **SQL injection** — isključivo parametrizovani queries kroz Supabase client
- **XSS u user-provided sadržaju** (notes, merchant names) — React default escape-uje, plus CSP
- **CSRF** — Next.js 15 Server Actions su CSRF-protected by default (origin check)
- **Session hijacking** — HttpOnly, Secure, SameSite=Lax cookies; sliding expiry 7 dana
- **Clickjacking** — CSP `frame-ancestors 'none'`
- **IDOR (Insecure Direct Object Reference)** — RLS + eksplicitna provjera `user_id = auth.uid()` u svakom Server Actionu
- **RLS bypass kroz service role** — service role key samo u server funkcijama, nikad u response-ima
- **Timing attacks na auth** — `crypto.timingSafeEqual` za sve secret comparisons
- **Log injection** — sanitize user input prije log-ovanja (newlines, kontrolni karakteri)
- **Zip bomb kroz CSV import** — hard limit 10MB file size, 10k rows
- **PDF malware / CVE-u vieweru** — parsiramo isključivo server-side kroz sandbox, nikad ne renderujemo u browser kroz objekt tag
- **LLM prompt injection** kroz merchant field — bilo koji user-provided sadržaj koji ide LLM-u je unutar [USER_INPUT] sekcije, nikad direktno u sistem prompt

### 2.4 Šta NE branimo (i zašto)

- **Napadač sa punim pristupom ti sam (developer)** — nema zaštite od autentifikovanog admina. Audit log je sve što imamo.
- **Device compromise** — ako korisniku neko pristupi telefonu dok je ulogovan, ne možemo pomoći. Sugerišemo biometric unlock OS layer.
- **Physical coercion** — nema "duress PIN" u MVP fazi. Razmotriti Fazu 5+ ako korisnici traže.
- **Advanced nation-state attacker** — out of scope za solo bootstrap. Ako te napada APT, izgubio si.

---

## 3. Authentication & Session Management

### 3.1 Auth flow

**Faza 0–1:** Email magic link isključivo.

- Korisnik unosi email
- Sistem šalje link sa JWT tokenom (15 min validnost)
- Klik na link → Supabase Auth validira → session cookie setovan
- Nema password-a = nema password-related vektora (phishing još uvijek postoji)

**Faza 2–3:** Dodaj opciono:

- **Passkey / WebAuthn** — najbolja UX za mobile, platform authenticator
- **TOTP 2FA** — opt-in za paranoid users
- **Recovery codes** — generisani prilikom setup-a, 10 jednokratnih kodova

**Nikad u Konto:**

- SMS 2FA (SIM swap)
- Security questions ("What was your mother's maiden name")
- Password reset preko email-a bez second factor-a (phishing)

### 3.2 Session management

- **Session cookie:** `konto-session`, HttpOnly, Secure, SameSite=Lax
- **Duration:** 7 dana rolling expiry (svaki request refresh-uje)
- **Max absolute:** 30 dana — nakon toga obavezni re-login
- **Logout:** kliring cookie + Supabase `signOut()` (invalidira refresh token)
- **Simultaneous sessions:** dozvoljeno do 5 uređaja; 6. potiskuje najstariji
- **Session list u profile settings:** korisnik vidi "Prijavljen na: iPhone, MacBook, Chrome Windows" sa opcijom revoke

### 3.3 Password-less specifics

Magic link email mora imati:

- **Precizno vrijeme isticanja** ("Ovaj link ističe u 14:35 CEST, za 15 minuta")
- **Source fingerprint** ("Zatraženo sa: Chrome na MacBook-u, Sarajevo")
- **One-click report** ("Nisam ja zatražio ovo" → flaguje pokušaj, auto revoke-uje session-e za email)

### 3.4 Account recovery

- **Email access je osnov recovery-ja.** Ako izgubi email, izgubi nalog. Ovo je dizajn odluka.
- **Nema "security questions".**
- **Faza 3+:** recovery codes (opt-in), trusted contacts (complex, možda nikad)

### 3.5 Rate limiting (Faza 2+)

Kroz Upstash Redis ili Supabase Edge Function sa pg table:

| Endpoint              | Limit   | Key                |
| --------------------- | ------- | ------------------ |
| Magic link request    | 3/sat   | email (normalized) |
| Magic link verify     | 10/min  | IP                 |
| Failed login attempts | 5/15min | email              |
| PDF upload            | 10/dan  | user_id            |
| LLM categorize        | 50/dan  | user_id            |
| Profile update        | 10/min  | user_id            |
| Account delete        | 1/dan   | user_id            |

---

## 4. Authorization & Access Control

### 4.1 RLS kao osnovni sloj 🔒

**Pravilo nepregovarivo:** Svaka tabela sa `user_id` kolonom ima RLS enabled i policies koje filtriraju po `auth.uid() = user_id`.

**Standardni obrazac:**

```sql
alter table public.XYZ enable row level security;

create policy "users manage own XYZ" on public.XYZ
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Gotcha-e:**

- `service_role` key **zaobilazi RLS**. Koristi ga samo kad ti stvarno treba (npr. cron job koji čita više korisnika).
- RLS policies na UPDATE/DELETE moraju imati **i `using` i `with check`**. `using` filtrira koje rowove vidiš, `with check` validira da nova vrijednost ostaje tvoja.
- Ne zaboravi RLS na **svim novim tabelama** — postavi `alter table enable row level security` odmah pri kreiranju.

**Test za svaku novu tabelu:**

```sql
-- Iz service role (superuser) — ovo treba vidjeti sve:
select count(*) from public.XYZ;

-- Iz user sesije User A — ovo treba vidjeti samo A-ove rowove:
set role authenticated;
set request.jwt.claim.sub to 'user-a-uuid';
select count(*) from public.XYZ;

-- Iz user sesije User B bez pristupa User A — 0 rowova:
set request.jwt.claim.sub to 'user-b-uuid';
select count(*) from public.XYZ where user_id = 'user-a-uuid';
-- Očekivano: 0
```

### 4.2 Application-level authorization (defense in depth)

Čak i sa RLS, **eksplicitno** provjeravamo u Server Actions:

```typescript
// PRAVILO: Svaki Server Action počinje sa:
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return { success: false, error: 'UNAUTHORIZED' };

// Ako Action operira na konkretnom resursu, eksplicitno verifikuj ownership:
const { data: resource } = await supabase
  .from('XYZ')
  .select('id, user_id')
  .eq('id', resourceId)
  .single();

if (!resource || resource.user_id !== user.id) {
  return { success: false, error: 'FORBIDDEN' };
}
```

**Zašto ovaj dupli check:** RLS može biti pogrešno konfigurisan (human error). Application layer je dodatni sigurnosni pojas.

### 4.3 Storage policies

Supabase Storage za PDF izvode:

```sql
-- Bucket: 'statements'
-- Path pattern: {user_id}/{batch_id}/{filename}.pdf

-- Users can upload to their folder
create policy "users upload own statements"
on storage.objects for insert
with check (
  bucket_id = 'statements'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own
create policy "users read own statements"
on storage.objects for select
using (
  bucket_id = 'statements'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own (za ručni cleanup)
create policy "users delete own statements"
on storage.objects for delete
using (
  bucket_id = 'statements'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

**Dodatna zaštita:** file size limit 10MB po PDF-u, max 50MB po korisniku u trenutku, bucket nema public policy.

---

## 5. Encryption

### 5.1 Enkripcija u tranzitu (TLS)

**Svuda obavezno.** Nikad plain HTTP.

- Vercel automatski TLS 1.3
- Supabase API automatski TLS 1.3
- HSTS header: `max-age=31536000; includeSubDomains; preload`
- Redirect HTTP → HTTPS na edge

### 5.2 Enkripcija u mirovanju (at rest)

**Platform-level (out of the box):**

- Supabase Postgres: AES-256 disk encryption (AWS EBS)
- Supabase Storage: AES-256 (S3)
- Vercel logs: enkriptovani

**Application-level (dodatna za najosjetljivije):**

Za Fazu 2+ razmotriti **envelope enkripciju** za:

- `transactions.notes` (slobodan tekst, može sadržavati PII)
- `transactions.description`
- `merchants.notes`

Pattern:

```typescript
// Master key u env var, rotabilan
const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY; // 32 bytes base64

// Po-korisniku DEK, generiran pri signup-u, čuva se enkriptovan u profile row
// profiles.encrypted_dek bytea
// profiles.dek_version int

// Enkripcija:
function encryptField(plaintext: string, userDek: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', userDek, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}
```

**Odluka za MVP (Faza 0–1):** Ne radimo application-level enkripciju. Platform TLS + disk encryption je dovoljno. Ovo je svjesni trade-off — dodaje kompleksnost i otežava search. Vraćamo se u Fazi 2 kad korisnici uploadaju PDF.

### 5.3 PDF handling specifično 🔒

**Pravila non-negotiable:**

1. PDF se uploadaje preko signed URL-a, nikad kroz serversku multipart formu (štedi resurse)
2. Parser pokreće u **Supabase Edge Function**, ne u Vercel runtime-u (da PDF ne prolazi kroz web layer)
3. **PDF se briše u roku od 24h** — automatski kroz pg_cron job
4. PDF ime u Storage-u je **UUID, nikad originalni filename**
5. Hash (SHA-256) se računa i čuva u `import_batches` za dedup — sam fajl se briše

**Cron job:**

```sql
-- Runs every hour
select cron.schedule(
  'delete-old-pdfs',
  '0 * * * *',
  $$
    delete from storage.objects
    where bucket_id = 'statements'
      and created_at < now() - interval '24 hours';

    update public.import_batches
    set storage_path = null
    where storage_path is not null
      and created_at < now() - interval '24 hours';
  $$
);
```

### 5.4 LLM prompt handling 🔒

**Pravilo:** Prije slanja bilo čega na eksterni LLM (Gemini, Mistral, OpenAI...):

1. **Redactaj IBAN-e** regex-om: `[A-Z]{2}\d{2}[A-Z0-9]{1,30}` → `[IBAN]`
2. **Redactaj brojeve kartica** kroz Luhn check + regex
3. **Redactaj imena** kroz small NER model (Faza 3+; u Fazi 2 OK bez ovoga)
4. **Log payload prije slanja** (u lokalni audit, ne u Sentry!) za 30 dana — za debugging
5. **Obavezno Vertex AI ili Gemini Production tier** — ne koriste podatke za trening po defaultu
6. **Nikad ne šalji više od jednog korisnika** u istom batch pozivu

**Prompt izolacija:**

```
System: [Instrukcije — nikad user-kontrolisan sadržaj]

User: Parsiraj sljedeći izvod:
<USER_INPUT>
[PDF tekst]
</USER_INPUT>

[Ostatak instrukcija i šeme]
```

User-provided sadržaj se **uvijek** nalazi unutar `<USER_INPUT>` tagova, nikad miješano sa instrukcijama.

---

## 6. GDPR + Lokalni compliance

### 6.1 Legal bases

| Processing                       | Legal basis                               |
| -------------------------------- | ----------------------------------------- |
| Auth + account management        | Contract (Art 6.1.b)                      |
| Finansijski podaci (transakcije) | Contract (Art 6.1.b)                      |
| Email komunikacija o nalogu      | Contract (Art 6.1.b)                      |
| Analytics                        | Legitimate interest (Art 6.1.f) + opt-out |
| Marketing emails                 | Consent (Art 6.1.a) — opt-in, ne default  |
| Vanjsko dijeljenje (affiliate)   | **Never without explicit consent**        |

### 6.2 Data subject rights (implement u Fazi 0–1 osnovne, Faza 3 advanced)

- **Right to access** — korisnik može exportovati sve svoje podatke u JSON (Faza 1)
- **Right to rectification** — edit u UI-ju (Faza 0)
- **Right to erasure** — "Obriši nalog" u settings; hard delete sa 30-day soft window (Faza 1)
- **Right to portability** — export (isti kao access) (Faza 1)
- **Right to object** — opt-out analytics, opt-out marketing (Faza 0)
- **Right to restrict** — ne implementiramo aktivno; delete account pokriva (Faza 4 možda)

### 6.3 Account deletion flow 🔒

```
User clicks "Obriši nalog"
  → Confirmation modal (unese email kao potvrdu)
  → Email sa 24h cancelation link ("Ne, ne brišite")
  → After 24h without cancel:
     - Soft delete: profiles.deleted_at = now()
     - Schedule hard delete za +30 dana
     - User ne može login
     - Email konfirmacija
  → After 30 days:
     - DELETE FROM auth.users (cascade briše sve user data)
     - PDF-ovi već izbrisani (24h rule)
     - Audit log zadržava samo event 'account_deleted', bez user_id
     - Final email "Nalog trajno obrisan"
```

### 6.4 Data retention policies

| Vrsta                  | Retention                              | Razlog                   |
| ---------------------- | -------------------------------------- | ------------------------ |
| Aktivni nalog + podaci | Dok god aktivan                        | Contract                 |
| Obrisani nalog         | 30 dana soft → hard delete             | GDPR + chance to recover |
| PDF izvodi             | **24 sata** 🔒                         | Minimizacija             |
| Audit log              | 90 dana                                | Sigurnost                |
| Backup-i               | 30 dana                                | Operational              |
| Analytics              | PostHog default (7 godina, aggregated) | Legitimate interest      |
| Email logs (Resend)    | 30 dana                                | Delivery debugging       |
| Sentry errors          | 90 dana                                | Debugging                |

### 6.5 Data Processing Agreements (DPAs)

**Obavezno potpisan DPA sa svim sub-processorima:**

- [x] Supabase (Standard DPA)
- [x] Vercel (Standard DPA)
- [x] Google Cloud / Gemini (Standard DPA)
- [x] Mistral AI (DPA dostupan)
- [x] Resend (DPA)
- [x] PostHog EU (DPA)
- [x] Sentry (DPA)
- [x] Cloudflare (DPA)

**Privacy policy lista svih sub-processor-a** po imenu, svrsi, lokaciji. Update kad god dodaš/skineš.

### 6.6 Lokalni BiH specifikum

Novi Zakon o zaštiti ličnih podataka BiH (okt 2025):

- Materijalno usklađen sa GDPR-om
- Tranzicioni period do okt 2027.
- Nadležno tijelo: **Agencija za zaštitu ličnih podataka BiH**
- Breach notification: 72h (isto kao GDPR)
- DPO: ne obavezan ispod 10k korisnika, razmotriti oko 5k

Srbija ZZPL:

- Ako primaš srpske korisnike, prijava kod Povjerenika nije obavezna ali preporučljiva
- Mirror-aj GDPR approach

### 6.7 Privacy policy i Terms

- Hostaj na `/privatnost` i `/uslovi`
- Koristi **Iubenda** ili **Termly** za generisanje, potroši ~€79/god (čuva te od velikog posla)
- Primary jezik: bosanski, sekundarno engleski
- Ključni sadržaj privacy policy-ja:
  - Ko smo (tvoje ime, adresa, email)
  - Šta prikupljamo (email, finansijski podaci, PDF izvodi na 24h)
  - Zašto (lista legal basis per purpose)
  - Kome šaljemo (lista sub-processor-a)
  - Koliko dugo (retention table)
  - Tvoja prava + kako ih ostvariti (email na privacy@konto.ba)
  - Kako kontaktirati

---

## 7. Security Hardening Checklist

### 7.1 Next.js / Vercel

- [x] `next.config.ts` ima strict security headers:
  ```typescript
  const securityHeaders = [
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    },
    {
      key: 'Content-Security-Policy',
      value:
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://eu.i.posthog.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co https://eu.i.posthog.com wss://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
    },
  ];
  ```
- [x] `X-Powered-By` header disabled
- [x] Production build: `next build` ne smije imati warning-e
- [x] Dependencies: `pnpm audit` u CI, **ne** mergaj PR sa high severity
- [x] Dependabot / Renovate za weekly dependency update

### 7.2 Supabase

- [x] **RLS enabled** na svakoj user-owned tabeli (provjeravati u migration reviewu)
- [x] Service role key **samo** u env var, nikad committed
- [x] Anon key OK za klijent (javni po dizajnu)
- [x] Auth redirect URLs strogo whitelistovani:
  - `https://konto.ba/**`
  - `https://staging.konto.ba/**`
  - `http://localhost:3000/**` (samo dev)
- [x] Auth provider settings: disable sign-ups ako ne želimo otvoren registration
- [x] Storage: svi bucket-i **private** (nikad public)
- [x] Postgres roles: koristi `authenticated` i `anon`, ne kreiraj custom

### 7.3 Code

- [x] Zod validacija na **svakom** inputu
- [x] Svaki Server Action verifikuje session (`getUser()`) prvi korak
- [x] Sensitive ops (delete account, export, bulk delete) **traže re-auth** (opet magic link)
- [x] Nema `dangerouslySetInnerHTML` bez eksplicitnog review-a
- [x] URL parameter parsing kroz Zod, ne direktno u query
- [x] File upload: MIME type check + magic bytes check (ne samo extenzija)
- [x] CORS: Next.js default je fine; nikad `Access-Control-Allow-Origin: *` na API endpointima

### 7.4 Secrets management

- [x] **Nikad commituj** `.env.local`, `*.pem`, `*.key`, bilo šta sa "key" u imenu
- [x] **Git hooks** (husky + lint-staged + gitleaks):
  ```bash
  # .husky/pre-commit
  npx gitleaks protect --staged --verbose
  pnpm lint-staged
  ```
- [x] `.gitignore` uključuje:
  ```
  .env*
  !.env.example
  *.pem
  *.key
  *.log
  .vercel
  .next
  node_modules
  .supabase
  ```
- [x] GitHub repo: privatni dok god ne odlučiš public-ovati (Faza 4+ open-source dio?)
- [x] **2FA obavezan** na: GitHub, Vercel, Supabase, domain registrar, Resend, Sentry, PostHog, Google/Anthropic
- [x] Password manager (1Password, Bitwarden) za sve naloge
- [x] Recovery backup: svi backup kodovi štampani + u sefu/safe deposit boxu (solo founder = bus factor 1)

### 7.5 Dev environment

- [x] Separate Supabase projekt za dev (`konto-dev`)
- [x] Dev data nikad production data — uvijek seed-ovi ili anonimizovano
- [x] Migrations testirane lokalno (`supabase db reset`) prije push-a

### 7.6 CI/CD

- [x] GitHub Actions workflow:
  - Lint + type check
  - `pnpm audit` (fail on high/critical)
  - Build
  - Run tests
- [x] Vercel preview deploys ne zapisuju na production bazu
- [x] Production deploy samo sa `main` grane, manually promote staging → main
- [x] No auto-deploy od external contributor-a (Faza 4+ ako open-source)

### 7.7 Monitoring

- [x] Sentry `beforeSend` hook koji redacts PII:
  ```typescript
  Sentry.init({
    beforeSend(event) {
      if (event.extra) {
        delete event.extra.email;
        delete event.extra.merchant_raw;
        delete event.extra.amount_cents;
      }
      return event;
    },
  });
  ```
- [x] PostHog: disable autocapture for input fields (ne snimaj tipkanje)
- [x] Vercel logs: redact PII u strukturisanim log-ovima

---

## 8. Incident Response

### 8.1 Incident severity levels

| Nivo | Definicija                                     | Response time   | Action                                 |
| ---- | ---------------------------------------------- | --------------- | -------------------------------------- |
| P0   | Data breach, production down, mass user impact | Immediately     | All hands, customer comms              |
| P1   | Sigurnosna ranjivost confirmed, fikse-able     | <4h             | Hotfix, user notification ako potrebno |
| P2   | Single user-impacting bug                      | <24h            | Fix in next release                    |
| P3   | Nice-to-have                                   | When convenient | Backlog                                |

### 8.2 Data breach response plan

Kad god sumnjaš da je došlo do curenja:

1. **Contain** — revoke kompromitovane ključeve, isključi affected feature, snapshot logova
2. **Assess** — koji useri, koji podaci, koliko dugo
3. **Notify** — unutar 72h: Agencija za zaštitu ličnih podataka BiH + affected korisnici (ako je high risk)
4. **Remediate** — fix root cause, pentest post-mortem
5. **Document** — internal postmortem, public transparency report ako je javno

**Notification template za korisnike** (priprema se unaprijed u `docs/incident-comms/`).

### 8.3 Backup recovery plan

- **Drill jednom u 6 mjeseci:** full restore iz `pg_dump` na staging projekat
- **Dokumentuj postupak** u `docs/runbooks/restore-from-backup.md`
- **Test data integrity** nakon restore: count-aj tabele, provjeri da tx balance matches accounts balance

### 8.4 Key rotation

- **Supabase service role key:** svaka 3 mjeseca ili na incident
- **LLM API keys:** svaka 3 mjeseca
- **Session secret:** godišnje ili na incident
- **Master encryption key (ako postoji):** samo na incident (rotacija je skupa, traži re-enkripciju)

---

## 9. User-facing Trust Indicators

Kredibilitet bez SOC 2. U Fazi 0–3 gradimo sljedeće:

### 9.1 `/sigurnost` stranica

Javna stranica koja opisuje:

- Gdje hostamo podatke (EU)
- Šta enkriptujemo i gdje
- Koji vendori imaju pristup i zašto
- Kako se može obrisati nalog
- Kako prijaviti ranjivost (security@konto.ba)
- Status pentesta (Faza 4+ kad imamo jedan)

### 9.2 `security.txt` (`/.well-known/security.txt`)

```
Contact: mailto:security@konto.ba
Expires: 2027-04-21T00:00:00.000Z
Preferred-Languages: bs, en
Canonical: https://konto.ba/.well-known/security.txt
Policy: https://konto.ba/sigurnost/disclosure
```

### 9.3 Transparency report (Faza 3+)

Godišnji izvještaj:

- Broj government data requestova (ako je bilo)
- Broj data breach incidenata
- Uptime statistika

### 9.4 Open source elemente

Faza 4+: publish-ati open source sljedeće (ako ima smisla):

- Merchant dictionary seed (`konto-merchants-ba`)
- Bank parser templates
- Crypto utilities (ako implementiramo E2EE vault)

---

## 10. Compliance Checklist by Phase

### Faza 0 (Pre-launch za sebe)

- [ ] RLS na svakoj user-owned tabeli
- [ ] HTTPS only (Vercel default)
- [ ] Security headers konfigurisani
- [ ] 2FA na svim dev nalozima
- [ ] `.gitignore` kompletan
- [ ] Git hooks (gitleaks) instalirani

### Faza 1 (Manual MVP)

- [ ] Privacy policy + Terms drafted
- [ ] Account delete flow
- [ ] Data export (JSON) flow
- [ ] Audit log tabela + basic events
- [ ] Sentry sa beforeSend PII redaction

### Faza 2 (Parser izvoda)

- [ ] PDF 24h auto-delete cron
- [ ] LLM PII redaction pre-prompt
- [ ] File size + MIME + magic bytes validation
- [ ] Rate limiting na upload

### Faza 3 (Insighti)

- [ ] Rate limiting na sve endpointe
- [ ] Passkey support (opcioni)
- [ ] Session list u settings
- [ ] `/sigurnost` public stranica
- [ ] `security.txt`

### Faza 4 (Beta korisnici, public launch)

- [ ] Jedan pentest (€5-10k, find-a-pentester za solo indie)
- [ ] Bug bounty program (opcioni, Huntr ili sličan)
- [ ] GDPR Article 30 registar processing activities
- [ ] DPO imenovan ako > 10k korisnika
- [ ] Incident response plan dokumentovan
- [ ] Annual transparency report prvi

---

## 11. Things We Will Never Do 🔒

- Nikad prodati podatke, ni agregirane ni individualne
- Nikad dijeliti podatke sa reklamnim mrežama
- Nikad uključiti third-party trackere (Facebook Pixel, GA, Hotjar) bez consent-a
- Nikad tvrditi "military grade encryption" ili "bank-level security" — to su marketinške laži
- Nikad odbiti SAR (subject access request) ili delete request
- Nikad logovati plaintext amount + merchant + user_id zajedno
- Nikad renderovati user-uploaded PDF u browseru
- Nikad dozvoliti password reset bez additional factor-a
- Nikad poslati SMS 2FA

---

## 12. Change Log

| Datum      | Verzija | Promjena           |
| ---------- | ------- | ------------------ |
| 2026-04-21 | 1.0     | Inicijalna verzija |
