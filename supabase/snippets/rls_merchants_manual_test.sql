-- Manual RLS checks for merchants + merchant_aliases (postgres session, then authenticated).
-- Usage: pnpm exec supabase db query -f supabase/snippets/rls_merchants_manual_test.sql -o table --agent=no

begin;

-- Deterministic UUIDs
-- ua / ub = auth users; ma / mb = merchants
do $body$
declare
  ua uuid := 'a0000000-0000-4000-8000-000000000001';
  ub uuid := 'b0000000-0000-4000-8000-000000000002';
  ma uuid := 'f0000000-0000-4000-8000-000000000001';
  mb uuid := 'f0000000-0000-4000-8000-000000000002';
  cat_a uuid;
  cat_b uuid;
begin
  delete from auth.users where id in (ua, ub);

  insert into auth.users (
    id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values
    (
      ua, 'authenticated', 'authenticated', 'rls-merchant-a@test.local',
      crypt('test', gen_salt('bf')), now(), now(), now(),
      '{}', '{}'
    ),
    (
      ub, 'authenticated', 'authenticated', 'rls-merchant-b@test.local',
      crypt('test', gen_salt('bf')), now(), now(), now(),
      '{}', '{}'
    );

  select c.id into cat_a from public.categories c
    where c.user_id = ua and c.slug = 'namirnice' limit 1;
  select c.id into cat_b from public.categories c
    where c.user_id = ub and c.slug = 'namirnice' limit 1;

  insert into public.merchants (id, user_id, canonical_name, display_name, default_category_id)
  values (ma, ua, 'Konzum', 'Konzum', cat_a);

  insert into public.merchants (id, user_id, canonical_name, display_name, default_category_id)
  values (mb, ub, 'Bingo', 'Bingo', cat_b);
end;
$body$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);

select count(*) = 1 as a_sees_one_merchant from public.merchants;
select count(*) = 0 as a_no_cross_user_rows
from public.merchants
where user_id = 'b0000000-0000-4000-8000-000000000002'::uuid;

insert into public.merchant_aliases (user_id, merchant_id, pattern)
values (
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'KONZUM%'
);

do $expect_rls_deny$
begin
  insert into public.merchant_aliases (user_id, merchant_id, pattern)
  values (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'f0000000-0000-4000-8000-000000000002'::uuid,
    'evil'
  );
  raise exception 'expected RLS to reject cross-user merchant_id';
exception
  when insufficient_privilege then
    null;
end;
$expect_rls_deny$;

select count(*) = 1 as alias_count_ok from public.merchant_aliases
where user_id = 'a0000000-0000-4000-8000-000000000001'::uuid;

rollback;

select 'rls_merchants_manual_test_passed' as result;
