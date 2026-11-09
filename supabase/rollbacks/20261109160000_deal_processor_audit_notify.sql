-- Rollback for 20261109160000_deal_processor_audit_notify.sql: removes the trigger and its function only.
-- activity_log / notifications rows it already wrote are kept (history). Nothing else was changed by the migration.
begin;
set local lock_timeout = '3s';
drop trigger if exists deals_processor_activity on public.deals;
drop function if exists private.trg_deal_processor();
commit;
