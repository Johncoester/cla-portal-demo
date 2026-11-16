-- FF-090 (Francis Santos, Nov 16 2026, 3:10 PM ET, msg 1a1e5fbfe4183a9f).
-- The mortgage brokerage on a file keeps a contact name, phone, email and address,
-- next to the company name already stored in mortgage_broker_name.
-- Existing rows start blank. Same row security as the other deal columns. No policy change.
-- Rollback: supabase/rollbacks/20261124010000_brokerage_contact.sql
begin;
set local lock_timeout = '3s';
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'mortgage_broker_name') then
    raise exception 'drift: deals.mortgage_broker_name is missing'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name in ('mortgage_broker_contact', 'mortgage_broker_phone', 'mortgage_broker_email', 'mortgage_broker_address')) then
    raise exception 'drift: a brokerage contact column already exists on deals'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'drift: deals RLS is off'; end if;
end $$;

alter table public.deals
  add column mortgage_broker_contact text not null default '',
  add column mortgage_broker_phone text not null default '',
  add column mortgage_broker_email text not null default '',
  add column mortgage_broker_address text not null default '';

comment on column public.deals.mortgage_broker_contact is
  'Contact name at the mortgage brokerage on this file. Existing rows start blank.';
comment on column public.deals.mortgage_broker_phone is
  'Phone for the mortgage brokerage contact on this file, stored as xxx-xxx-xxxx when it is a 10-digit number. Existing rows start blank.';
comment on column public.deals.mortgage_broker_email is
  'Email for the mortgage brokerage contact on this file. Existing rows start blank.';
comment on column public.deals.mortgage_broker_address is
  'Mailing address of the mortgage brokerage on this file. Existing rows start blank.';

do $$
declare n int;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'mortgage_broker_contact' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: mortgage_broker_contact not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'mortgage_broker_phone' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: mortgage_broker_phone not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'mortgage_broker_email' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: mortgage_broker_email not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'mortgage_broker_address' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: mortgage_broker_address not as expected'; end if;
  select count(*) into n from public.deals where mortgage_broker_contact <> '' or mortgage_broker_phone <> '' or mortgage_broker_email <> '' or mortgage_broker_address <> '';
  if n <> 0 then raise exception 'readback: % deals already have brokerage contact values (no backfill expected)', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then
    raise exception 'readback: deals RLS is off'; end if;
end $$;
commit;
