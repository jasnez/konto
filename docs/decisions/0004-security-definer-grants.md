# ADR 0004: `SECURITY DEFINER` funkcije i kanonski REVOKE/GRANT obrazac

## Status

Prihvaćeno (Faza 3 / Pre-beta hardening) — **obavezno za sve nove DEFINER funkcije**

## Kontekst

Supabase **automatski grant-uje EXECUTE privilegiju** na svaku funkciju u `public` shemi rolama `public`, `anon`, `authenticated` i `service_role`. To znači da je svaka novonapravljena PL/pgSQL funkcija po defaultu **anonimno pozivljiva preko REST/RPC sloja**, čak i kada nikad nismo eksplicitno radili `GRANT`.

Za `SECURITY INVOKER` funkcije ovo je obično bezopasno: pozivlac nasleđuje svoje vlastite privilegije, RLS i dalje važi, pa anon poziv koji čita podatke ne može da pročita ništa što već ne bi mogao da pročita kroz REST.

**Za `SECURITY DEFINER` funkcije, podrazumevana auto-grant je opasna**: te funkcije rade s privilegijama svog vlasnika (`postgres`), pa preskaču RLS. Ako anonimni napadač uspe da pozove DEFINER funkciju koja modifikuje podatke ili curi informacije, dobija privilegovanu primitivu koju nije trebalo da ima.

`REVOKE EXECUTE … FROM public` **nije dovoljno** da zatvori ovu rupu. `public` je _grupna rola_; eksplicitne grant-ove dodeljene direktno `anon`-u, `authenticated`-u ili `service_role`-u to ne uklanja. Verifikovano tokom SE-10 integracionog testa (vidi 00067) i opisano u radnom postupku za Supabase.

## Odluka

Svaka `SECURITY DEFINER` funkcija u `public` shemi mora imati **eksplicitne per-rola REVOKE iskaze**, plus eksplicitan `GRANT` namernoj roli (i samo njoj):

```sql
create or replace function public.fn(...)
returns ...
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Internal auth gate — defense-in-depth backstop ako se ACL-ovi ipak uvale.
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;
  -- ...
end;
$$;

-- Strip Supabase auto-grants eksplicitno per-role.
revoke all on function public.fn(...) from public;
revoke all on function public.fn(...) from anon;
revoke all on function public.fn(...) from authenticated;

-- Re-grant SAMO namerni rola.
grant execute on function public.fn(...) to authenticated;
```

### Tri kanonska profila

1. **Pozivljiva od authenticated korisnika** (npr. `finalize_import_batch`, `confirm_recurring`):
   - REVOKE FROM `public`, `anon`, `authenticated`
   - GRANT TO `authenticated`

2. **Pozivljiva od anon-a po dizajnu** (npr. `preview_invite_code`):
   - REVOKE FROM `public`, `anon`, `authenticated`
   - GRANT TO `anon, authenticated`
   - **Mora** sadržati i interni rate-limit gate (vidi `check_anon_rate_limit_and_record` u 00067).

3. **Interna infrastruktura, nije pozivljiva preko REST-a** (npr. `acquire_cron_lock`, `check_anon_rate_limit_and_record`):
   - REVOKE FROM `public`, `anon`, `authenticated`
   - **Bez GRANT-a** — pozive prave samo druge DEFINER funkcije ili `postgres`/`service_role` preko admin klijenta.

### Internal auth gate je obavezan

Pored ACL-a, svaka DEFINER funkcija koja koristi identitet pozivaoca **mora** imati `if auth.uid() is null then raise exception 'UNAUTHORIZED'` na početku. To je defense-in-depth backstop: ako se ACL u budućnosti slučajno olabavi (npr. neka migracija zaboravi REVOKE), interna provera i dalje blokira anon poziv.

### Zašto i `revoke … from public` i `revoke … from authenticated`

Iz [Postgres dokumentacije](https://www.postgresql.org/docs/current/sql-revoke.html): rola `public` je _implicitna grupa_ koja sadrži sve role; `authenticated` je _imenovana rola_. Direktan grant na `authenticated` nije obuhvaćen `REVOKE FROM public`. Zato se navode oboje.

## Posljedice

### Pozitivne

- DEFINER funkcije su lock-down by-default; svaki novi DEFINER mora se eksplicitno otvoriti za nameravani auditorijum.
- Drift-u-zonu pokrivamo predvidivim obrascem; novi developeri ili AI agenti ne mogu „samo da napišu funkciju i grant-uju je” jer ovaj ADR opisuje obavezni minimum.
- ACL-promene se vide u review-u: `revoke … from anon` u diff-u je jasna namera.

### Negativne / trade-off

- Tri dodatne linije po DEFINER funkciji (3× revoke + 1× grant) — minimalno verbozno, ali plaćamo zbog Supabase auto-grant ponašanja koje ne možemo da kontrolišemo.
- Migracija koja menja potpis funkcije mora ponoviti REVOKE/GRANT blok (Postgres briše ACL kad se menja signature).

## Alternative koje su odbačene

- **`REVOKE FROM public` samo** — verifikovano nedovoljno: Supabase auto-grant na `anon` ostaje aktivan.
- **`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`** — ne primenjuje se na već postojeće funkcije i Supabase ipak može override-ovati u kasnijim release-ovima. Per-funkcijski eksplicitni REVOKE je deterministički.
- **Ostaviti samo internal `auth.uid()` gate** — defense in depth pati: jedna zaboravljena provera u nekoj budućoj funkciji = privesc surface. ACL-i su drugi sloj.

## Implementacija

- **Postojeće funkcije**: migracija [00070](../../supabase/migrations/20260627120000_00070_tighten_definer_grants.sql) primenjuje obrazac na 10 pisanju izloženih DEFINER funkcija (CRUD na transactions, recurring, goals, profiles, kategorije, rate_limits).
- **Read-only DEFINER funkcije** (npr. `get_monthly_summary`, `get_current_period_spent`) eksplicitno su izostavljene jer ne pišu ništa; ipak imaju internal `auth.uid()` gate. Mogu se zatvoriti u kasnijoj iteraciji ako se rizik analiza promeni.
- **Trigger funkcije** (npr. `update_account_balance`, `audit_log_prevent_mutation`) nemaju REST surface — Postgres ih poziva interno. ACL nije relevantan.

## Povezano

- [../../supabase/migrations/20260624120000_00067_anon_rate_limit_for_invite_preview.sql](../../supabase/migrations/20260624120000_00067_anon_rate_limit_for_invite_preview.sql) — prvi primer gde je obrazac primenjen kompletno (SE-10).
- [../../supabase/migrations/20260625120000_00068_cron_execution_lock.sql](../../supabase/migrations/20260625120000_00068_cron_execution_lock.sql) — drugi primer (SE-11), uključujući _internal infra_ varijantu (bez GRANT-a).
- [../../supabase/migrations/20260627120000_00070_tighten_definer_grants.sql](../../supabase/migrations/20260627120000_00070_tighten_definer_grants.sql) — primenjuje obrazac na 10 starijih write-heavy DEFINER funkcija.

## Change log

| Datum      | Izmjena                                                              |
| ---------- | -------------------------------------------------------------------- |
| 2026-05-08 | Inicijalna verzija (S.1 iz Supabase architecture audit-a 2026-05-08) |
