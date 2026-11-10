-- Francis (processor): lender file fields on an order, plus the type of a lender contact.
--   deals.lender_address            mailing address of the lender company
--   deals.cpl_address               closing protection letter address
--   deals.cpl_same_as_lender        when true, the CPL address is the lender address
--   deals.mortgage_broker_name      brokerage / mortgage broker (not the lender company)
--   contacts.lender_role            loan_officer or lender_tc; null means not set
-- Existing lender columns (lender_name, lender_contact, lender_phone, lender_email, loss_payee_name)
-- are not changed and are not backfilled. Existing contacts stay lender_role null, so a company
-- with no person and every current lender contact keep working. Loss-payee search reads the
-- existing loss_payee_name values; this script does not copy them.
-- Table grants already cover new columns (authenticated has SELECT, INSERT, UPDATE on the tables).
-- Rollback: supabase/rollbacks/20261110081500_lender_clause_cpl_contacts.sql
begin;
set local lock_timeout = '3s';
do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name in ('lender_address', 'cpl_address', 'cpl_same_as_lender', 'mortgage_broker_name')) then
    raise exception 'drift: a lender file column already exists on deals'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'lender_role') then
    raise exception 'drift: contacts.lender_role already exists'; end if;
  if exists (select 1 from pg_constraint where conname = 'contacts_lender_role_chk') then
    raise exception 'drift: contacts_lender_role_chk already exists'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 61 then raise exception 'drift: deals has % columns, expected 61', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'contacts';
  if n <> 41 then raise exception 'drift: contacts has % columns, expected 41', n; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'loss_payee_name' and data_type = 'text' and is_nullable = 'NO') then
    raise exception 'drift: deals.loss_payee_name is missing or changed'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'lender_name' and data_type = 'text' and is_nullable = 'NO') then
    raise exception 'drift: deals.lender_name is missing or changed'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'contact_type' and data_type = 'text' and is_nullable = 'YES') then
    raise exception 'drift: contacts.contact_type is missing or changed'; end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_contact_type_check') then
    raise exception 'drift: contacts_contact_type_check is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then raise exception 'drift: deals RLS is off'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.contacts'::regclass) then raise exception 'drift: contacts RLS is off'; end if;
end $$;

alter table public.deals
  add column lender_address text not null default '',
  add column cpl_address text not null default '',
  add column cpl_same_as_lender boolean not null default false,
  add column mortgage_broker_name text not null default '';

alter table public.contacts add column lender_role text;

alter table public.contacts add constraint contacts_lender_role_chk
  check (lender_role is null or lender_role in ('loan_officer', 'lender_tc'));

comment on column public.deals.lender_address is
  'Mailing address of the lender company on this order. Existing rows start blank.';
comment on column public.deals.cpl_address is
  'Closing protection letter address. When cpl_same_as_lender is true this matches lender_address. Existing rows start blank.';
comment on column public.deals.cpl_same_as_lender is
  'True when the CPL address is the lender address. Existing rows are false.';
comment on column public.deals.mortgage_broker_name is
  'Mortgage broker or lender brokerage. Not the lender company name. Existing rows start blank.';
comment on column public.contacts.lender_role is
  'loan_officer or lender_tc (the lender processor). Null on every existing contact and on a lender company saved with no person.';

do $$
declare n int;
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'lender_address' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: lender_address not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'cpl_address' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: cpl_address not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'cpl_same_as_lender' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') <> 1 then
    raise exception 'readback: cpl_same_as_lender not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deals'
      and column_name = 'mortgage_broker_name' and data_type = 'text' and is_nullable = 'NO' and column_default = (repeat('''', 2) || '::text')) <> 1 then
    raise exception 'readback: mortgage_broker_name not as expected'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'contacts'
      and column_name = 'lender_role' and data_type = 'text' and is_nullable = 'YES' and column_default is null) <> 1 then
    raise exception 'readback: lender_role not as expected'; end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_lender_role_chk' and convalidated) then
    raise exception 'readback: contacts_lender_role_chk missing'; end if;
  select count(*) into n from public.deals where lender_address <> '' or cpl_address <> '' or cpl_same_as_lender or mortgage_broker_name <> '';
  if n <> 0 then raise exception 'readback: % deals already have lender file values (no backfill expected)', n; end if;
  select count(*) into n from public.contacts where lender_role is not null;
  if n <> 0 then raise exception 'readback: % contacts already have lender_role (no backfill expected)', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 65 then raise exception 'readback: deals has % columns, expected 65', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'contacts';
  if n <> 42 then raise exception 'readback: contacts has % columns, expected 42', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.deals'::regclass) then raise exception 'readback: deals RLS is off'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.contacts'::regclass) then raise exception 'readback: contacts RLS is off'; end if;
  if not has_column_privilege('authenticated', 'public.deals', 'cpl_address', 'SELECT') then
    raise exception 'readback: authenticated cannot select cpl_address'; end if;
  if not has_column_privilege('authenticated', 'public.contacts', 'lender_role', 'UPDATE') then
    raise exception 'readback: authenticated cannot update lender_role'; end if;
end $$;
commit;
