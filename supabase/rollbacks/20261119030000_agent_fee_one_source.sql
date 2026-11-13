-- Rollback for 20261119030000_agent_fee_one_source.sql: removes the guard so the order's older commission fields can be written again.
-- The commissions already moved into Agent fees stay there (they are in the Agent fees change history); nothing is moved back.
begin;
drop trigger if exists deals_old_commission_guard on public.deals;
drop function if exists private.deal_old_commission_guard();
drop function if exists private.old_commission_num(jsonb);
drop function if exists private.old_commission_keys();
commit;
