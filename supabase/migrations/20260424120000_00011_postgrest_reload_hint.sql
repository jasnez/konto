-- Nudge PostgREST to reload schema after migrations (reduces stale cache right after `db reset`).
notify pgrst, 'reload schema';
