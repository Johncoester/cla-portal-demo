-- Rollback for 20261129020500_crm_deal_report_tasks.sql: removes the one function it added.
-- Reports keep working without it; task date columns show blank.
begin;
set local lock_timeout = '3s';
drop function if exists public.crm_deal_report_tasks();
commit;
