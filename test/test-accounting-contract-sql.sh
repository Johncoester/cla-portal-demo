#!/bin/sh
# Disposable database. Applies the review SQL and checks staff persistence.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_acct_contract_$$
psql_super() { sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
psql_super <<'SQL'
create schema if not exists auth;
create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public, private to authenticated;
grant usage on schema public to anon;
grant execute on function auth.uid() to authenticated;
create table public.deals (id uuid primary key, is_demo boolean not null default false, purchase_price numeric);
insert into public.deals (id, purchase_price) values ('22222222-2222-2222-2222-222222222222', 111);
create table private.features (name text primary key, enabled boolean not null default false, note text);
insert into private.features (name, enabled) values
  ('accounting', false), ('funding', false), ('wires', false), ('policy', false), ('title', false), ('crm', true);
create or replace function private.acct_on() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select enabled from private.features where name = 'accounting'), false) $$;
create or replace function private.me_role() returns text language sql stable as $$ select current_setting('test.role', true) $$;
create or replace function private.is_admin() returns boolean language sql stable as $$ select current_setting('test.role', true) in ('Admin', 'Super admin') $$;
create or replace function private.can_access_deal(d uuid) returns boolean language sql stable as $$
  select current_setting('test.role', true) is not null and current_setting('test.role', true) not in ('Client', 'Buyer Agent', 'Listing Agent') $$;
create or replace function private.acct_editor(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor'), false) and private.can_access_deal(d) $$;
create or replace function private.acct_reader(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.acct_on() and coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) and private.can_access_deal(d) $$;
create or replace function private.viewer_is_demo() returns boolean language sql stable as $$ select false $$;
grant select on public.deals to authenticated;
grant execute on function private.acct_on(), private.me_role(), private.is_admin(), private.can_access_deal(uuid), private.acct_editor(uuid), private.acct_reader(uuid), private.viewer_is_demo() to authenticated;
SQL
psql_super -f "$ROOT/supabase/review/20261107_test_accounting_contract_terms.sql"
psql_super <<'SQL'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('test.role', 'Processor', false);
set role authenticated;
do $$ begin
  begin
    insert into public.accounting_contract_terms (deal_id) values ('22222222-2222-2222-2222-222222222222');
    raise exception 'insert succeeded while accounting was off';
  exception when insufficient_privilege then null;
  end;
end $$;
set role postgres;
SQL
psql_super -f "$ROOT/supabase/review/20261107_enable_test_accounting_flag.sql"
psql_super <<'SQL'
do $$ begin
  if (select enabled from private.features where name = 'accounting') is distinct from true then raise exception 'accounting flag'; end if;
  if exists (select 1 from private.features where name in ('funding','wires','policy','title') and enabled) then raise exception 'other feature enabled'; end if;
  if (select enabled from private.features where name = 'crm') is distinct from true then raise exception 'crm changed'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('test.role', 'Processor', false);
set role authenticated;
insert into public.accounting_contract_terms (deal_id, loan_amount, loan_percent, seller_credit_amount, emd_amount, emd_method, emd_receipt, field_flags)
values ('22222222-2222-2222-2222-222222222222', null, 80, null, 25, null, 'pending', '{"emdAmount":{"basis":"explicit","provisional":true,"source":"fixture"}}'::jsonb);
do $$ begin
  if (select loan_amount is null and seller_credit_amount is null and emd_method is null and emd_amount = 25 and emd_receipt = 'pending' and loan_percent = 80
      from public.accounting_contract_terms where deal_id = '22222222-2222-2222-2222-222222222222') is not true then
    raise exception 'nulls were not preserved';
  end if;
  if (select purchase_price from public.deals where id = '22222222-2222-2222-2222-222222222222') is distinct from 111 then
    raise exception 'the order price changed';
  end if;
  if (select count(*) from public.accounting_contract_terms_log) <> 1 then raise exception 'log missing'; end if;
end $$;
update public.accounting_contract_terms set seller_credit_amount = 0 where deal_id = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select seller_credit_amount from public.accounting_contract_terms) is distinct from 0 then raise exception 'typed zero was not stored'; end if;
  if (select loan_amount is null from public.accounting_contract_terms) is not true then raise exception 'loan amount was filled in'; end if;
end $$;
do $$ begin
  begin
    update public.accounting_contract_terms set loan_amount = 1.234;
    raise exception 'bad scale was stored';
  exception when check_violation then null;
  end;
  begin
    update public.accounting_contract_terms set emd_receipt = 'received';
    raise exception 'received status was stored';
  exception when check_violation then null;
  end;
  begin
    update public.accounting_contract_terms set posture = 'verified';
    raise exception 'verified posture was stored';
  exception when check_violation or raise_exception then null;
  end;
  begin
    update public.accounting_contract_terms set field_flags = '{"loanAmount":{"basis":"derived","provisional":false}}'::jsonb;
    raise exception 'a verified marker was stored';
  exception when raise_exception then null;
  end;
  if (select loan_amount is null and seller_credit_amount = 0 and emd_receipt = 'pending' and posture = 'estimate' from public.accounting_contract_terms) is not true then
    raise exception 'a failed write changed the row';
  end if;
end $$;
select set_config('test.role', 'Sales Person', false);
do $$
declare n int;
begin
  update public.accounting_contract_terms set sale_price = 5 where deal_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'sales update wrote % row(s)', n; end if;
  if (select sale_price is null from public.accounting_contract_terms) is not true then raise exception 'sales changed the price'; end if;
  if (select count(*) from public.accounting_contract_terms) <> 1 then raise exception 'sales could not read'; end if;
end $$;
select set_config('test.role', 'Client', false);
do $$
declare n int;
begin
  select count(*) into n from public.accounting_contract_terms;
  if n <> 0 then raise exception 'client read % row(s)', n; end if;
  begin
    insert into public.accounting_contract_terms (deal_id) values ('33333333-3333-3333-3333-333333333333');
    raise exception 'client insert succeeded';
  exception when insufficient_privilege or foreign_key_violation or unique_violation then null;
  end;
end $$;
set role anon;
do $$ begin
  begin
    perform 1 from public.accounting_contract_terms;
    raise exception 'anon read succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('test.role', 'Processor', false);
do $$ begin
  begin
    delete from public.accounting_contract_terms;
    raise exception 'delete succeeded';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.accounting_contract_terms) <> 1 then raise exception 'the row was deleted'; end if;
end $$;
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres -c "drop database $DB;"
echo "accounting contract sql passed"
