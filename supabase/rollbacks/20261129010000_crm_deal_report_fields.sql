-- Rollback for 20261129010000_crm_deal_report_fields.sql: removes the one function it added.
-- The Deals report keeps working without it; the extra file columns show blank.
begin;
set local lock_timeout = '3s';
drop function if exists public.crm_deal_report_fields();
commit;
