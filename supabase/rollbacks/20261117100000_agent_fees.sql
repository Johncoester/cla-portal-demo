-- Rollback for AF-1 (20261117100000_agent_fees.sql). Drops the agent fee tables and functions. Fee history is lost.
begin;
drop trigger if exists deals_agent_fee_price on public.deals;
drop function if exists public.save_agent_fees(uuid, text, jsonb, text);
drop function if exists public.agent_fee_history(uuid);
drop function if exists public.agent_fees(uuid);
drop function if exists private.agent_fee_price_sync();
drop function if exists private.agent_fee_json(public.deal_agent_fees);
drop function if exists private.agent_fee_actor(uuid, text);
drop function if exists private.agent_fee_sync(numeric, text, numeric, numeric);
drop function if exists private.agent_fee_default_payer(text);
drop function if exists private.agent_fee_num(text, text);
drop table if exists public.deal_agent_fee_log;
drop table if exists public.deal_agent_fees;
commit;
