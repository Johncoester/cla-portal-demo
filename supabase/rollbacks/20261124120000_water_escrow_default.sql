-- Rollback PRORATE-1 water escrow. New files stop getting the default line.
-- Lines already saved on a file stay, including a changed amount. Nothing is deleted.
begin;
set local lock_timeout = '3s';
drop trigger if exists deals_water_escrow on public.deals;
drop function if exists private.seed_water_escrow();
commit;
