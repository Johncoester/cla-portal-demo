-- Exact rollback of 20261110200000_parcel_earnest_financial.sql.
-- Drops deals.parcel_id and deals.financial only. Lender columns, latitude,
-- longitude, and contacts (including contacts.custom) are left in place.
-- Values saved in the new columns are lost.
begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public;

do $$
declare n int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'parcel_id'
  ) then
    raise exception 'drift: deals.parcel_id is not present';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'financial'
  ) then
    raise exception 'drift: deals.financial is not present';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_parcel_id_len') then
    raise exception 'drift: deals_parcel_id_len is not present';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_financial_obj') then
    raise exception 'drift: deals_financial_obj is not present';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';
  if n <> 69 then
    raise exception 'drift: deals has % columns, expected 69', n;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'drift: deals RLS is off';
  end if;
end $$;

alter table public.deals drop constraint deals_financial_obj;
alter table public.deals drop constraint deals_parcel_id_len;
alter table public.deals drop column financial;
alter table public.deals drop column parcel_id;

do $$
declare n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals'
      and column_name in ('parcel_id', 'financial')
  ) then
    raise exception 'readback: parcel_id or financial was not dropped';
  end if;
  if exists (select 1 from pg_constraint where conname in ('deals_parcel_id_len', 'deals_financial_obj')) then
    raise exception 'readback: a parcel or financial check remains';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';
  if n <> 67 then
    raise exception 'readback: deals has % columns, expected 67', n;
  end if;
end $$;

commit;
