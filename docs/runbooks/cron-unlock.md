# Runbook — Cron Replay Lock Unlock

> **Kada koristiti:** Vercel Cron job (`/api/cron/insights-nightly` ili `/api/cron/post-due-installments`) je vratio HTTP 409 i Sentry pokazuje `*_replay_rejected`. Ovo se dešava kada je `cron_executions` lock zaglavljen jer je prethodni run pao usred izvršavanja.

## Pozadina

Migracija [`00068_cron_execution_lock`](../../supabase/migrations/20260625120000_00068_cron_execution_lock.sql) (SE-11) uvodi `acquire_cron_lock(p_cron_name, p_min_interval_seconds)` SECURITY DEFINER funkciju koja serializuje cron pokrete. Vercel ne može da injektuje per-request nonce u Bearer header, pa je replay zaštita server-strana: lock se otpušta tek nakon `p_min_interval_seconds` (22h za Konto cron-ove).

**Posljedica neuspjeha:** ako cron padne u 03:30 UTC, sljedeći legitiman pokret zakazan za 03:00 UTC narednog dana će biti odbačen jer 22h nije prošlo. **24h gap u izvršavanju** dok se lock ručno ne očisti.

Vercel ne radi auto-retry pala cron-a. Ovo je svjesna design odluka u SE-11.

## Kako prepoznati problem

1. Sentry alert `insights_nightly_user_error` ili `post_due_installments_error` sa stacktrace-om.
2. Vercel cron log pokazuje HTTP 500 ili nehvatljivu grešku.
3. Sljedeći cron pokret vraća HTTP 409 sa `error: "Replay rejected"`.

## Kako otključati

### Opcija 1 — Supabase Studio (preporučeno za beta)

Otvori [Supabase Studio → SQL Editor](https://supabase.com/dashboard/project/_/sql) i izvrši:

```sql
-- Najprije provjeri šta je u ledger-u
select * from public.cron_executions
order by created_at desc
limit 5;

-- Obriši poslednji pokret samo ako je zaista pao (ne ako je legitimno završio)
delete from public.cron_executions
 where cron_name = 'insights_nightly'      -- ili 'post_due_installments'
   and created_at >= now() - interval '23 hours';

-- Provjeri da je obrisan
select * from public.cron_executions
order by created_at desc
limit 5;
```

### Opcija 2 — psql preko service role

```bash
export DATABASE_URL=postgres://postgres:[SERVICE_PASSWORD]@db.[PROJ].supabase.co:5432/postgres
psql "$DATABASE_URL" -c "delete from public.cron_executions where cron_name = 'insights_nightly' and created_at >= now() - interval '23 hours';"
```

### Opcija 3 — manual cron trigger nakon unlock-a

Nakon brisanja, pokreni cron ručno preko Vercel dashboard-a (Functions → /api/cron/insights-nightly → Run Now) ili curl-a:

```bash
curl -X GET https://[YOUR_DOMAIN]/api/cron/insights-nightly \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

## Sigurnosne napomene

- **Ne briši stare unose** (starije od 23h). Oni su legitimna istorija; brisanje nema efekta na lock (jer je window 22h), ali zagađuje audit-trail.
- **Ne mijenjaj `acquire_cron_lock`** funkciju. Ona je SECURITY DEFINER i lock-down-ovana eksplicitnim per-role REVOKE-om (vidi [ADR 0004](../decisions/0004-security-definer-grants.md)).
- **Provjeri root cause**: zašto je cron pao? Sentry stack trace. Problemi:
  - Service role key rotated mid-run (Vercel env redeploy)
  - Gemini API outage (insights detector koristi LLM kategorizaciju)
  - Postgres connection pool exhaustion
  - Memory exhaustion (insights detector preload velikog tx history-ja)

## Sentry alert preporuka

Da bi se ove pad-ove vidjelo u roku od sati a ne 24h:

```yaml
# Sentry alert rule — set up via Sentry dashboard
name: cron_user_error_burst
when: event.tag.event_name in ['insights_nightly_user_error', 'post_due_installments_error']
threshold: 5 events in 1 hour
notify: ops Slack channel + email
```

## Eskalacija

Ako lock unlock + manual trigger ne uspije (drugi cron pad odmah), problem je u kodu detektora ili u Postgres-u, ne u lock-u. Pogledaj:

- Sentry stack trace za root cause
- Supabase Dashboard → Logs → Postgres za query timeout-e
- Vercel Function logs za out-of-memory

## Povezano

- [Migracija 00068 — cron_execution_lock](../../supabase/migrations/20260625120000_00068_cron_execution_lock.sql)
- [ADR 0004 — SECURITY DEFINER grants](../decisions/0004-security-definer-grants.md)
- [`/api/cron/insights-nightly` route](../../app/api/cron/insights-nightly/route.ts)
- [`/api/cron/post-due-installments` route](../../app/api/cron/post-due-installments/route.ts)
