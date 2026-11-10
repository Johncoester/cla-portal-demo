-- Exact rollback of 20261110071500_deal_closer.sql.
-- Names and staff links saved after the forward script are removed with the columns.
begin;
set local lock_timeout = '3s';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closer_name'
  ) then raise exception 'drift: deals.closer_name is not present'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'closer_profile_id'
  ) then raise exception 'drift: deals.closer_profile_id is not present'; end if;
  if to_regprocedure('private.deal_closer_guard()') is null then
    raise exception 'drift: private.deal_closer_guard is missing'; end if;
end $$;

drop trigger deals_closer_guard on public.deals;
drop function private.deal_closer_guard();
drop index public.deals_closer_profile_idx;
alter table public.deals drop constraint deals_closer_name_len;
alter table public.deals drop column closer_profile_id;
alter table public.deals drop column closer_name;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name in ('closer_name', 'closer_profile_id')
  ) then raise exception 'readback: a closer column is still present'; end if;
  if to_regprocedure('private.deal_closer_guard()') is not null then
    raise exception 'readback: private.deal_closer_guard still exists'; end if;
  if exists (select 1 from pg_trigger where tgname = 'deals_closer_guard') then
    raise exception 'readback: deals_closer_guard still exists'; end if;
end $$;

commit;
