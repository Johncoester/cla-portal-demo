-- Undo 20261125320000_crm_home_charts.sql.
-- Drops public.crm_home_charts, its four policies, and the table comment
-- (the comment goes with the table). It does not change deals, tasks,
-- profiles, dashboard charts, or any private helper.
-- Not applied by this file. The lead runs it only to undo the Home-chart migration.
-- Never run it on production (bxixxgcqxmtzkrolywas).

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

drop policy if exists crm_home_charts_delete on public.crm_home_charts;
drop policy if exists crm_home_charts_update on public.crm_home_charts;
drop policy if exists crm_home_charts_insert on public.crm_home_charts;
drop policy if exists crm_home_charts_select on public.crm_home_charts;
drop table if exists public.crm_home_charts;

commit;
