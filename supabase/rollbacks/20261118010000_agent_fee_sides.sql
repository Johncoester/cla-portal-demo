-- Rollback for AF-2 (20261118010000_agent_fee_sides.sql).
begin;
drop function if exists public.agent_fee_sides(uuid);
commit;
