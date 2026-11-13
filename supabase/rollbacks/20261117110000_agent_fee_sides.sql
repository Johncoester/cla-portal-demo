-- Rollback for AF-2 (20261117110000_agent_fee_sides.sql).
begin;
drop function if exists public.agent_fee_sides(uuid);
commit;
