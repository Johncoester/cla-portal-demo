-- Extra parcel IDs live on the deal row the page already loads. The first stays in parcel_id.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

alter table public.deals add column if not exists parcel_ids jsonb not null default '[]'::jsonb;

alter table public.deals drop constraint if exists deals_parcel_ids_list;
alter table public.deals add constraint deals_parcel_ids_list check (
  jsonb_typeof(parcel_ids) = 'array' and jsonb_array_length(parcel_ids) <= 12
);

update public.deals
   set parcel_ids = jsonb_build_array(btrim(parcel_id))
 where parcel_ids = '[]'::jsonb
   and btrim(coalesce(parcel_id, '')) <> '';

do $readback$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'parcel_ids'
  ) then
    raise exception 'readback: parcel_ids is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_parcel_ids_list') then
    raise exception 'readback: parcel list check is missing';
  end if;
end
$readback$;
commit;
