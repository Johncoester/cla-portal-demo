-- Drops dashboard_file_task_counts. No rows are rewritten.
begin;
set local lock_timeout = '3s';
drop function if exists public.dashboard_file_task_counts(uuid[]);
commit;
