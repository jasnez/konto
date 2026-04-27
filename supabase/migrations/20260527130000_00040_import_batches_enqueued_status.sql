-- AV-2: Async parse pipeline introduces an `enqueued` status that sits between
-- `uploaded` (just-uploaded PDF) and `parsing` (worker actively running).
-- Watchdog uses this state to detect events that never reached the worker.

alter table import_batches
  drop constraint if exists import_batches_status_check;

alter table import_batches
  add constraint import_batches_status_check
  check (status in ('uploaded','enqueued','parsing','ready','imported','failed','rejected'));
