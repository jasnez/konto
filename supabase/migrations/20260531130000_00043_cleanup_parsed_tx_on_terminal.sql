-- DL-7: Delete parsed_transactions rows when an import batch reaches a
-- terminal failure state ('failed' or 'rejected').
--
-- Background: parsed_transactions is a staging table for LLM-parsed PDF rows.
-- Once a batch reaches a terminal state the staging data is no longer needed
-- for review but the import_batches row is kept for audit/history. Without a
-- cleanup path the staging rows accumulate indefinitely.
--
-- Fix: an AFTER UPDATE trigger on import_batches that fires when status
-- transitions INTO 'failed' or 'rejected' from a non-terminal state and
-- immediately deletes all matching parsed_transactions rows.
-- The trigger is idempotent (DELETE WHERE ... is a no-op if rows are gone).
--
-- One-time backfill: clean up any staging rows already orphaned by
-- previously-failed/rejected batches.

-- 1. Trigger function.
create or replace function public.cleanup_parsed_transactions_on_terminal_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Only act on status transitions INTO a terminal state.
  if new.status in ('failed', 'rejected')
     and (old.status is null or old.status not in ('failed', 'rejected'))
  then
    delete from public.parsed_transactions where batch_id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.cleanup_parsed_transactions_on_terminal_status() is
  'Briše staging redove iz parsed_transactions kada import_batches status postane terminal (failed/rejected).';

-- 2. Trigger on import_batches.
drop trigger if exists import_batches_cleanup_on_terminal on public.import_batches;

create trigger import_batches_cleanup_on_terminal
  after update of status on public.import_batches
  for each row
  execute function public.cleanup_parsed_transactions_on_terminal_status();

-- 3. One-time backfill: remove orphaned staging rows from batches that were
-- already in a terminal state before this migration ran.
delete from public.parsed_transactions
where batch_id in (
  select id from public.import_batches
  where status in ('failed', 'rejected')
);
