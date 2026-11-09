-- Who CLA represents on a deal (John, Nov 8): both, buyer, or seller. Null = not recorded.
-- No default and no backfill: every existing row stays null. New orders get 'both' only because the Place Order
-- form preselects it; an explicit choice is saved as chosen. Not a portal role, participant role, referral, or
-- access grant. Writes are governed by the existing deals_insert / deals_update policies (staff only); the app
-- hides the value from Outside users. No policy, grant, or function is changed.
begin;
set local lock_timeout = '3s';
do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'cla_representation') then
    raise exception 'drift: deals.cla_representation already exists'; end if;
  if exists (select 1 from pg_constraint where conname = 'deals_cla_representation_chk') then
    raise exception 'drift: deals_cla_representation_chk already exists'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 57 then raise exception 'drift: deals has % columns, expected 57', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then raise exception 'drift: deals RLS is off'; end if;
end $$;

alter table public.deals add column cla_representation text;

alter table public.deals add constraint deals_cla_representation_chk
  check (cla_representation is null or cla_representation in ('both', 'buyer', 'seller'));

comment on column public.deals.cla_representation is
  'CLA representation: both, buyer, or seller. Null means not recorded. Not a role, referral, or access grant.';

do $$
declare n int;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'cla_representation' and data_type = 'text' and is_nullable = 'YES' and column_default is null) <> 1 then
    raise exception 'readback: column not as expected'; end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_cla_representation_chk' and convalidated) then
    raise exception 'readback: check constraint missing'; end if;
  select count(*) into n from public.deals where cla_representation is not null;
  if n <> 0 then raise exception 'readback: % rows have a value (no backfill expected)', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then raise exception 'readback: deals RLS is off'; end if;
end $$;
commit;
