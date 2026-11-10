-- Exact rollback of 20261110081500_lender_clause_cpl_contacts.sql.
-- Drops only the four deal columns and contacts.lender_role. Existing lender name, contact,
-- phone, email and loss payee are left in place. Values saved in the new columns are lost.
begin;
set local lock_timeout = '3s';
do $$
declare n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'lender_address') then
    raise exception 'drift: deals.lender_address is not present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'cpl_address') then
    raise exception 'drift: deals.cpl_address is not present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'cpl_same_as_lender') then
    raise exception 'drift: deals.cpl_same_as_lender is not present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'mortgage_broker_name') then
    raise exception 'drift: deals.mortgage_broker_name is not present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'lender_role') then
    raise exception 'drift: contacts.lender_role is not present'; end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_lender_role_chk') then
    raise exception 'drift: contacts_lender_role_chk is not present'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 63 then raise exception 'drift: deals has % columns, expected 63', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'contacts';
  if n <> 42 then raise exception 'drift: contacts has % columns, expected 42', n; end if;
end $$;

alter table public.contacts drop constraint contacts_lender_role_chk;
alter table public.contacts drop column lender_role;
alter table public.deals drop column mortgage_broker_name;
alter table public.deals drop column cpl_same_as_lender;
alter table public.deals drop column cpl_address;
alter table public.deals drop column lender_address;

do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name in ('lender_address', 'cpl_address', 'cpl_same_as_lender', 'mortgage_broker_name')) then
    raise exception 'readback: a lender file column is still on deals'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contacts' and column_name = 'lender_role') then
    raise exception 'readback: contacts.lender_role is still present'; end if;
  if exists (select 1 from pg_constraint where conname = 'contacts_lender_role_chk') then
    raise exception 'readback: contacts_lender_role_chk is still present'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'loss_payee_name') then
    raise exception 'readback: deals.loss_payee_name was dropped'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deals' and column_name = 'lender_name') then
    raise exception 'readback: deals.lender_name was dropped'; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'deals';
  if n <> 59 then raise exception 'readback: deals has % columns, expected 59', n; end if;
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'contacts';
  if n <> 41 then raise exception 'readback: contacts has % columns, expected 41', n; end if;
end $$;
commit;
