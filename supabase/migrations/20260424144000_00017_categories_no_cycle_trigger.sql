-- =============================================================================
-- 20260424144000_00017_categories_no_cycle_trigger.sql
--
-- Prevent parent/child cycles in public.categories.
--
-- Problem
-- -------
-- `categories.parent_id` self-references `categories.id`. No CHECK or trigger
-- prevented cycles. Two sequential updates can set A.parent=B and B.parent=A;
-- any hierarchical walk (future `/uvidi` tree view, future budgets) then
-- infinite-loops.
--
-- Strategy
-- --------
-- BEFORE INSERT OR UPDATE trigger. When parent_id is non-null, walk the
-- parent chain with a recursive CTE:
--   * If the chain re-encounters the row's own id → raise.
--   * If the chain exceeds MAX_DEPTH → raise.
--
-- The recursive CTE is bounded by MAX_DEPTH so a pre-existing cycle in
-- the rest of the tree cannot itself cause an infinite loop in this check.
-- Depth of 10 is plenty for any real taxonomy — the BiH default set has
-- a flat structure (one level), and even user-customized trees rarely
-- exceed 3–4 levels.
-- =============================================================================

create or replace function public.categories_no_cycles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max_depth constant int := 10;
  v_cycle_hit boolean;
  v_depth_hit boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Short-circuit: direct self-reference.
  if new.parent_id = new.id then
    raise exception 'categories: parent_id cannot equal id (self-reference)'
      using errcode = 'check_violation';
  end if;

  -- Walk the ancestor chain, stopping at the first repeat or at MAX_DEPTH.
  with recursive ancestors(id, parent_id, depth) as (
    select c.id, c.parent_id, 1
    from public.categories c
    where c.id = new.parent_id
    union all
    select c.id, c.parent_id, a.depth + 1
    from public.categories c
    join ancestors a on a.parent_id = c.id
    where a.depth < v_max_depth
  )
  select
    bool_or(a.id = new.id),
    bool_or(a.depth >= v_max_depth and a.parent_id is not null)
  into v_cycle_hit, v_depth_hit
  from ancestors a;

  if v_cycle_hit then
    raise exception 'categories: parent_id chain forms a cycle through id=%', new.id
      using errcode = 'check_violation';
  end if;

  if v_depth_hit then
    raise exception 'categories: parent_id chain exceeds max depth (%)', v_max_depth
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger categories_no_cycles_trg
  before insert or update of parent_id, id on public.categories
  for each row execute function public.categories_no_cycles();
