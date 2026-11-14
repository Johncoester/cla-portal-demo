-- Rollback for 20261120010000_task_builder_flows.sql. NOT APPLIED by this file.
-- Removes Task Builder's tables and functions. Every saved flow and its history is deleted.
-- Nothing else uses them in TB-1 (flows do not run on files yet).
begin;
set local lock_timeout = '3s';

drop function if exists public.set_task_flow_active(uuid, boolean);
drop function if exists public.save_task_flow(uuid, text, text, text, int);
drop function if exists public.list_task_flows();
drop function if exists private.task_flow_trigger_text(text, int);
drop table if exists public.task_flow_log;
drop table if exists public.task_flows;

commit;
