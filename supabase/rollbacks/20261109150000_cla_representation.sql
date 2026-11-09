-- Exact rollback of 20261109150000_cla_representation.sql. Removes only the CLA representation column and its check.
-- Any sides saved after the forward script are lost (they exist nowhere else).
begin;
set local lock_timeout = '3s';
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'cla_representation') then
    raise exception 'drift: deals.cla_representation is not present'; end if;
end $$;
alter table public.deals drop constraint deals_cla_representation_chk;
alter table public.deals drop column cla_representation;
do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'cla_representation') then
    raise exception 'readback: column still present'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 57 then raise exception 'readback: deals has % columns, expected 57', n; end if;
end $$;
commit;
