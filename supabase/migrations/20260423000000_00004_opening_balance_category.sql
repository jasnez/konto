-- 00004: system category for account opening balance (seed + backfill for existing users).

create or replace function public.insert_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.categories (user_id, name, slug, icon, kind, is_system, sort_order)
  values
    -- Expense
    (p_user_id, 'Hrana i piće',        'hrana-i-pice',        '🍽️', 'expense',  true,  10),
    (p_user_id, 'Namirnice',           'namirnice',           '🛒', 'expense',  true,  20),
    (p_user_id, 'Stanovanje',          'stanovanje',          '🏠', 'expense',  true,  30),
    (p_user_id, 'Komunalije',          'komunalije',          '💡', 'expense',  true,  40),
    (p_user_id, 'Prevoz',              'prevoz',              '🚗', 'expense',  true,  50),
    (p_user_id, 'Gorivo',              'gorivo',              '⛽', 'expense',  true,  60),
    (p_user_id, 'Zdravlje',            'zdravlje',            '🏥', 'expense',  true,  70),
    (p_user_id, 'Odjeća i obuća',      'odjeca-i-obuca',      '👕', 'expense',  true,  80),
    (p_user_id, 'Zabava',              'zabava',              '🎬', 'expense',  true,  90),
    (p_user_id, 'Pretplate',           'pretplate',           '📱', 'expense',  true, 100),
    (p_user_id, 'Obrazovanje',         'obrazovanje',         '🎓', 'expense',  true, 110),
    (p_user_id, 'Djeca',               'djeca',               '🧸', 'expense',  true, 120),
    (p_user_id, 'Pokloni i donacije',  'pokloni-i-donacije',  '🎁', 'expense',  true, 130),
    (p_user_id, 'Putovanja',           'putovanja',           '✈️', 'expense',  true, 140),
    (p_user_id, 'Lična njega',         'licna-njega',         '💆', 'expense',  true, 150),
    (p_user_id, 'Kućni ljubimci',      'kucni-ljubimci',      '🐕', 'expense',  true, 160),
    (p_user_id, 'Bankarske naknade',   'bankarske-naknade',   '🏦', 'expense',  true, 170),
    (p_user_id, 'Porezi',              'porezi',              '📋', 'expense',  true, 180),
    (p_user_id, 'Ostalo',              'ostalo',              '📦', 'expense',  true, 190),
    (p_user_id, 'Početno stanje',      'opening_balance',     '⚖️', 'income',  true, 195),
    -- Income
    (p_user_id, 'Plata',               'plata',               '💰', 'income',   true, 210),
    (p_user_id, 'Freelance',           'freelance',           '💼', 'income',   true, 220),
    (p_user_id, 'Bonus',               'bonus',               '🎉', 'income',   true, 230),
    (p_user_id, 'Kamata',              'kamata',              '📈', 'income',   true, 240),
    (p_user_id, 'Poklon',              'poklon',              '🎁', 'income',   true, 250),
    (p_user_id, 'Povrat',              'povrat',              '↩️', 'income',   true, 260),
    (p_user_id, 'Ostali prihodi',      'ostali-prihodi',      '💵', 'income',   true, 270),
    -- Transfer
    (p_user_id, 'Transferi',           'transferi',           '🔄', 'transfer', true, 310)
  on conflict (user_id, slug) do nothing;
end;
$$;

insert into public.categories (user_id, name, slug, icon, kind, is_system, sort_order)
select
  u.id,
  'Početno stanje',
  'opening_balance',
  '⚖️',
  'income',
  true,
  195
from auth.users u
on conflict (user_id, slug) do nothing;
