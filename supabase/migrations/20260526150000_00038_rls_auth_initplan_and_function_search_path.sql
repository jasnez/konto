-- Supabase performance advisor: wrap auth.* in RLS with (select auth.<function>())
-- so the value is planned once (InitPlan), not re-evaluated per row.
-- Security advisor: pin mutable search_path on SECURITY INVOKER SQL helpers.
--
-- Ref: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ──────────────────────────────────────────────────────────────────────────
-- installment_plans / installment_occurrences
-- ──────────────────────────────────────────────────────────────────────────
drop policy if exists "users manage own installment_plans" on public.installment_plans;
create policy "users manage own installment_plans" on public.installment_plans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own installment_occurrences" on public.installment_occurrences;
create policy "users manage own installment_occurrences"
  on public.installment_occurrences
  for all
  using (
    exists (
      select 1
      from public.installment_plans p
      where p.id = installment_occurrences.plan_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.installment_plans p
      where p.id = installment_occurrences.plan_id
        and p.user_id = (select auth.uid())
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- receipt_scans
-- ──────────────────────────────────────────────────────────────────────────
drop policy if exists "users manage own receipt_scans" on public.receipt_scans;
create policy "users manage own receipt_scans" on public.receipt_scans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- storage.objects — receipts bucket (same initplan pattern)
-- ──────────────────────────────────────────────────────────────────────────
drop policy if exists "users read own receipts" on storage.objects;
create policy "users read own receipts"
  on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "users insert own receipts" on storage.objects;
create policy "users insert own receipts"
  on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "users update own receipts" on storage.objects;
create policy "users update own receipts"
  on storage.objects
  for update
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "users delete own receipts" on storage.objects;
create policy "users delete own receipts"
  on storage.objects
  for delete
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Harden function search_path (advisor: avoid search_path hijacking)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.count_receipt_scans_today()
returns int
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.receipt_scans
  where user_id = (select auth.uid())
    and created_at >= date_trunc('day', now() at time zone 'UTC');
$$;

alter function public.create_transfer_pair(
  uuid, uuid,
  bigint, bigint,
  text, text,
  bigint, bigint, text,
  double precision, double precision,
  date, date,
  boolean, boolean,
  date, text
) set search_path = public, pg_temp;

notify pgrst, 'reload schema';
