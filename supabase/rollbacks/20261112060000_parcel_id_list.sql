-- Drops the extra parcel list. The primary parcel_id column is left as it was.
begin;
set local lock_timeout = '3s';

alter table public.deals drop constraint if exists deals_parcel_ids_list;
alter table public.deals drop column if exists parcel_ids;

do $readback$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'parcel_ids'
  ) then
    raise exception 'readback: parcel_ids remains';
  end if;
end
$readback$;
commit;
