-- Rollback for 20261130023000_crm_report_schedules.sql: removes the schedule table and its
-- guard. Saved schedules are lost (reports themselves are untouched). Reports keep working;
-- the report page shows no schedule.
begin;
set local lock_timeout = '3s';
drop table if exists public.crm_report_schedules;
drop function if exists private.crm_report_schedule_guard();
commit;
