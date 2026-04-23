-- =============================================================================
-- search_merchants: pg_trgm similarity + substring fallback for autocomplete.
-- pg_trgm extension lives in schema extensions (00001_initial_schema).
-- =============================================================================

create or replace function public.search_merchants(p_query text, p_limit int default 10)
returns table (
  id uuid,
  canonical_name text,
  display_name text,
  default_category_id uuid,
  icon text,
  color text,
  transaction_count int,
  similarity_score real
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  select
    m.id,
    m.canonical_name,
    m.display_name,
    m.default_category_id,
    m.icon,
    m.color,
    m.transaction_count,
    similarity(m.canonical_name, btrim(p_query))::real as similarity_score
  from public.merchants m
  where m.user_id = (select auth.uid())
    and m.deleted_at is null
    and length(btrim(p_query)) >= 1
    and (
      m.canonical_name ilike '%' || btrim(p_query) || '%'
      or similarity(m.canonical_name, btrim(p_query)) > 0.12
    )
  order by
    similarity(m.canonical_name, btrim(p_query)) desc,
    m.transaction_count desc
  limit least(coalesce(nullif(p_limit, 0), 10), 50);
$$;

grant execute on function public.search_merchants(text, int) to authenticated;
