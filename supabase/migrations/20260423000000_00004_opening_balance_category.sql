-- 00004: duplicate of 00003 (20260422200000) added under this timestamp for local repo flow.
-- Remote already records both versions; the real DDL lives in 20260422200000_00003_*.sql.
-- No-op so `supabase db reset` does not re-apply the same function and seed twice.
select 1;
