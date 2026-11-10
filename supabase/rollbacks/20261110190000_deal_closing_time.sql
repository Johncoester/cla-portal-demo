-- Exact rollback of 20261110190000_deal_closing_time.sql.
-- Times saved after the forward script are removed with the column.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
begin
  if to_regclass('public.deals') is null then
    raise exception 'drift: public.deals is missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_time'
  ) then raise exception 'drift: deals.closing_time is not present'; end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_closing_time_chk') then
    raise exception 'drift: deals_closing_time_chk is missing'; end if;
end $$;

alter table public.deals drop constraint deals_closing_time_chk;
alter table public.deals drop column closing_time;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closing_time'
  ) then raise exception 'readback: deals.closing_time is still present'; end if;
  if exists (select 1 from pg_constraint where conname = 'deals_closing_time_chk') then
    raise exception 'readback: deals_closing_time_chk still exists'; end if;
end $$;

commit;
