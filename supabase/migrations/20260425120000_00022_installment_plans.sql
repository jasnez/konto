-- Installment-payment plans for credit cards.
--
-- An installment_plan represents one purchase split into N equal monthly
-- payments. Each expected payment becomes an installment_occurrence row.
-- A Vercel Cron job (daily) queries occurrences with due_date <= today and
-- state = 'pending', then posts the transaction and marks them 'posted'.

-- ──────────────────────────────────────────────────────────────────────────
-- installment_plans
-- ──────────────────────────────────────────────────────────────────────────
create table public.installment_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  merchant_id       uuid references public.merchants(id) on delete set null,
  category_id       uuid references public.categories(id) on delete set null,

  currency          text not null check (char_length(currency) = 3),
  total_cents       bigint not null check (total_cents > 0),
  installment_count int    not null check (installment_count between 2 and 60),
  installment_cents bigint not null check (installment_cents > 0),

  -- day_of_month used for occurrences 2..N (first uses start_date exactly)
  start_date        date not null,
  day_of_month      int  not null check (day_of_month between 1 and 28),

  notes             text,
  status            text not null default 'active'
                      check (status in ('active', 'completed', 'cancelled')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger installment_plans_updated_at
  before update on public.installment_plans
  for each row execute function public.trigger_set_updated_at();

create index idx_installment_plans_user  on public.installment_plans(user_id);
create index idx_installment_plans_acct  on public.installment_plans(account_id);

alter table public.installment_plans enable row level security;
create policy "users manage own installment_plans" on public.installment_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- installment_occurrences
-- ──────────────────────────────────────────────────────────────────────────
create table public.installment_occurrences (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.installment_plans(id) on delete cascade,
  occurrence_num int  not null,          -- 1-based index within the plan
  due_date       date not null,
  amount_cents   bigint not null check (amount_cents > 0),
  transaction_id uuid references public.transactions(id) on delete set null,
  state          text not null default 'pending'
                   check (state in ('pending', 'posted', 'skipped')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (plan_id, occurrence_num)
);

create trigger installment_occurrences_updated_at
  before update on public.installment_occurrences
  for each row execute function public.trigger_set_updated_at();

create index idx_inst_occ_plan      on public.installment_occurrences(plan_id);
create index idx_inst_occ_due_state on public.installment_occurrences(due_date, state)
  where state = 'pending';

alter table public.installment_occurrences enable row level security;

-- Occurrences are owned indirectly through the plan.
create policy "users manage own installment_occurrences"
  on public.installment_occurrences
  for all using (
    exists (
      select 1 from public.installment_plans p
      where p.id = installment_occurrences.plan_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.installment_plans p
      where p.id = installment_occurrences.plan_id
        and p.user_id = auth.uid()
    )
  );
