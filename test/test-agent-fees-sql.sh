#!/bin/sh
# AF-1 agent fees (John, Nov 12 2026 decisions). Disposable database only: applies
# supabase/migrations/20261117100000_agent_fees.sql on a small stand-in schema and checks the rules.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_agent_fees_$$
psql_super() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
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
grant execute on function auth.uid() to authenticated;
create table public.profiles (id uuid primary key, role text, status text default 'active', is_admin boolean default false,
  first_name text, last_name text, is_demo boolean default false);
create table public.deals (id uuid primary key, purchase_price numeric, transaction_type text default 'Purchase',
  tc_user_id uuid, preprocessor_user_id uuid, is_demo boolean default false);
create table public.contacts (id uuid primary key, profile_id uuid);
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid, contact_id uuid, role text, created_at timestamptz default now());
create table public.deal_sales_people (deal_id uuid, sales_id uuid);
create table public.team_members (team_id uuid, profile_id uuid, member_role text);
create or replace function private.effective_uid() returns uuid language sql stable as $$ select auth.uid() $$;
create or replace function private.is_viewing_as() returns boolean language sql stable as $$ select false $$;
create or replace function private.view_as_readonly() returns trigger language plpgsql as $$
begin if private.is_viewing_as() then raise exception 'View as is read-only.' using errcode = '42501'; end if; return coalesce(new, old); end $$;
create or replace function private.me_role() returns text language sql stable security definer set search_path to pg_catalog, public as $$
  select role from public.profiles where id = private.effective_uid() and status = 'active' $$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false) $$;
create or replace function private.my_contact_id() returns uuid language sql stable security definer set search_path to pg_catalog, public as $$
  select id from public.contacts where profile_id = private.effective_uid() $$;
-- same bodies as TEST (Nov 12 2026)
create or replace function private.can_access_deal(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
    or exists (select 1 from public.deal_participants p where p.deal_id = d and p.contact_id = private.my_contact_id())) $$;
create or replace function private.is_preprocessor() returns boolean language sql stable as $$ select coalesce(private.me_role() = 'Preprocessor', false) $$;
create or replace function private.is_processor() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Processor', 'Preprocessor'), false) or private.is_admin() $$;
create or replace function private.can_run_deal(d uuid) returns boolean language sql stable security definer set search_path to pg_catalog, public as $$
  select (not private.is_preprocessor() and private.is_processor()) or (private.is_preprocessor() and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid())) $$;
create or replace function private.is_staffish() returns boolean language sql stable as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $$;
create or replace function private.file_roles_of(pid uuid, d uuid) returns text[] language sql stable security definer set search_path to pg_catalog, public as $$
  select case when pr.role is null then '{}'::text[] when pr.role <> 'Outside user' then array[pr.role]
    else coalesce((select array_agg(x.role order by array_position(array['Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller'], x.role))
                   from (select distinct p.role from public.deal_participants p join public.contacts c on c.id = p.contact_id
                         where p.deal_id = d and c.profile_id = pid and p.role in ('Buyer Agent', 'Listing Agent', 'Client-Buyer', 'Client-Seller')) x), array['Outside user']) end
  from (select (select role from public.profiles where id = pid) as role) pr $$;
grant select on public.profiles, public.deals to authenticated;
grant update (purchase_price) on public.deals to authenticated;
grant execute on all functions in schema private to authenticated;

-- people: a processor, a sales person, a buyer's agent, a listing agent, a buyer, a TC on the listing agent's team, another TC
insert into public.profiles (id, role, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Processor', 'Pat', 'Processor'),
  ('00000000-0000-0000-0000-0000000000a2', 'Sales Person', 'Sam', 'Sales'),
  ('00000000-0000-0000-0000-0000000000b1', 'Outside user', 'Bea', 'Buyeragent'),
  ('00000000-0000-0000-0000-0000000000b2', 'Outside user', 'Lou', 'Listingagent'),
  ('00000000-0000-0000-0000-0000000000c1', 'Outside user', 'Joy', 'Buyer'),
  ('00000000-0000-0000-0000-0000000000d1', 'Transaction Coordinator', 'Tia', 'Coordinator'),
  ('00000000-0000-0000-0000-0000000000d2', 'Transaction Coordinator', 'Ted', 'Other');
insert into public.contacts values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1');
insert into public.deals (id, purchase_price) values ('22222222-2222-2222-2222-222222222222', 300000), ('33333333-3333-3333-3333-333333333333', null);
insert into public.deals (id, purchase_price, transaction_type) values ('44444444-4444-4444-4444-444444444444', 250000, 'Refinance');
insert into public.deal_participants (deal_id, contact_id, role) values
  ('22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-0000000000b1', 'Buyer Agent'),
  ('22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-0000000000b2', 'Listing Agent'),
  ('22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-0000000000c1', 'Client-Buyer');
insert into public.team_members values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-0000000000b2', 'agent'),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-0000000000d1', 'coordinator');
SQL
psql_super -f "$ROOT/supabase/migrations/20261117100000_agent_fees.sql"
# applying twice is harmless
psql_super -f "$ROOT/supabase/migrations/20261117100000_agent_fees.sql"
psql_super -f "$ROOT/supabase/migrations/20261118010000_agent_fee_sides.sql"

psql_super -o /dev/null <<'SQL'
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL %', msg; end if; raise notice 'PASS  %', msg; end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. staff enter the buyer's agent side: 3% of $300,000, an admin fee (buyer pays by default), two other fees
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer',
  '{"commission":{"basis":"percent","percent":"3"},"admin":{"amount":"395"},"other":[{"description":"Referral fee","amount":"500","paidTo":"ABC Referrals"},{"description":"Transaction fee","amount":"150.5","paidTo":"Bright Realty"}]}');
reset role;
select pg_temp.ok((select amount = 9000 and pct = 3 and basis = 'percent' and source = 'staff' and confirmed_at is null
  from public.deal_agent_fees where side = 'buyer' and kind = 'commission'), 'staff 3% of $300,000 = $9,000, source staff, not confirmed');
select pg_temp.ok((select payer = 'buyer' and amount = 395 from public.deal_agent_fees where side = 'buyer' and kind = 'admin'), 'admin fee on the buyer''s agent side: the buyer pays by default');
select pg_temp.ok((select count(*) = 2 from public.deal_agent_fees where side = 'buyer' and kind = 'other'), 'two other fees saved');
select pg_temp.ok((select count(*) = 4 from public.deal_agent_fee_log where source = 'staff' and old_value is null), 'each new fee is in the history');

-- 2. listing side by dollar amount: the % is worked out and gives back the same cents
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'listing',
  '{"commission":{"basis":"amount","amount":"7,777.77"},"admin":{"amount":"250"}}');
reset role;
select pg_temp.ok((select amount = 7777.77 and round(300000 * pct / 100, 2) = amount and basis = 'amount'
  from public.deal_agent_fees where side = 'listing' and kind = 'commission'), '$7,777.77 on $300,000: % and $ agree to the cent');
select pg_temp.ok((select payer = 'seller' from public.deal_agent_fees where side = 'listing' and kind = 'admin'), 'admin fee on the listing side: the seller pays by default');

-- 3. plain errors
set role authenticated;
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('33333333-3333-3333-3333-333333333333', 'buyer', '{"commission":{"basis":"percent","percent":"3"}}')$q$)
  like 'Add the sales price before entering a commission%', 'no sales price: plain message');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"commission":{"basis":"percent","percent":"abc"}}')$q$)
  = 'Commission % must be a number.', 'bad number: plain message');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"commission":{"basis":"percent","percent":"101"}}')$q$)
  = 'Commission % must be a number from 0 to 100.', 'over 100%: plain message');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"other":[{"description":"a","amount":1,"paidTo":"x"},{"description":"a","amount":1,"paidTo":"x"},{"description":"a","amount":1,"paidTo":"x"},{"description":"a","amount":1,"paidTo":"x"},{"description":"a","amount":1,"paidTo":"x"},{"description":"a","amount":1,"paidTo":"x"}]}')$q$)
  = 'Up to 5 other fees per agent.', 'six other fees: refused');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"other":[{"description":"Referral","amount":"10"}]}')$q$)
  = 'Other fee 1: enter who it is paid to.', 'other fee without paid to: refused');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('44444444-4444-4444-4444-444444444444', 'buyer', '{"admin":{"amount":"1"}}')$q$)
  = 'A refinance has no agent fees.', 'refinance: refused');
reset role;
select pg_temp.ok((select count(*) = 6 from public.deal_agent_fees), 'refused saves changed nothing');

-- 4. who sees what
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select pg_temp.ok((select string_agg(side || ':' || access, ',') = 'listing:edit,buyer:edit' from public.agent_fee_sides('22222222-2222-2222-2222-222222222222')), 'AF-2: the processor may change both sides');
select pg_temp.ok((select count(*) = 0 from public.agent_fee_sides('44444444-4444-4444-4444-444444444444')), 'AF-2: a refinance has no agent sides');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.ok((select string_agg(side || ':' || access, ',') = 'buyer:edit' from public.agent_fee_sides('22222222-2222-2222-2222-222222222222')), 'AF-2: the buyer''s agent gets only their side');
select pg_temp.ok((select count(*) = 4 and bool_and(side = 'buyer') and bool_and(can_edit) from public.agent_fees('22222222-2222-2222-2222-222222222222')), 'the buyer''s agent sees only the buyer''s agent side');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'listing', '{"admin":{"amount":"1"}}')$q$)
  = 'You can''t change agent fees on this file.', 'the buyer''s agent can''t change the listing side');
select pg_temp.ok(pg_temp.err('select count(*) from public.deal_agent_fees') like 'permission denied%', 'nobody reads the fee table directly');
select pg_temp.ok(pg_temp.err('select count(*) from public.deal_agent_fee_log') like 'permission denied%', 'nobody reads the history table directly');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select count(*) = 0 from public.agent_fees('22222222-2222-2222-2222-222222222222')), 'the buyer sees no agent fees');
select pg_temp.ok((select count(*) = 0 from public.agent_fee_sides('22222222-2222-2222-2222-222222222222')), 'AF-2: the buyer gets no agent sides');
select pg_temp.ok((select count(*) = 0 from public.agent_fee_history('22222222-2222-2222-2222-222222222222')), 'the buyer sees no fee history');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"admin":{"amount":"1"}}')$q$)
  = 'You can''t change agent fees on this file.', 'the buyer can''t change agent fees');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"admin":{"amount":"1"}}')$q$)
  = 'You can''t change agent fees on this file.', 'a sales person not on the file can''t change agent fees');
reset role;

-- 5. the buyer's agent changes their commission to 2.5%: agent confirmed, logged as the agent
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer',
  '{"commission":{"basis":"percent","percent":"2.5"},"admin":{"amount":"395"},"other":[{"description":"Referral fee","amount":"500","paidTo":"ABC Referrals"},{"description":"Transaction fee","amount":"150.50","paidTo":"Bright Realty"}]}');
select pg_temp.ok((select confirmed_role = 'agent' and confirmed_by_name = 'Bea Buyeragent' and source = 'agent' from public.agent_fees('22222222-2222-2222-2222-222222222222') where kind = 'commission'), 'agent change: Agent confirmed, by the agent');
reset role;
select pg_temp.ok((select amount = 7500 and pct = 2.5 from public.deal_agent_fees where side = 'buyer' and kind = 'commission'), 'agent 2.5% of $300,000 = $7,500');
select pg_temp.ok((select count(*) = 4 from public.deal_agent_fees where side = 'buyer' and confirmed_role = 'agent'), 'saving confirms every fee on the agent''s side');
select pg_temp.ok((select (old_value ->> 'amount')::numeric = 9000 and (new_value ->> 'amount')::numeric = 7500 and source = 'agent'
  from public.deal_agent_fee_log where side = 'buyer' and kind = 'commission' order by id desc limit 1), 'history: old $9,000, new $7,500, source agent');
select pg_temp.ok((select count(*) = 3 from public.deal_agent_fee_log where side = 'buyer' and source = 'agent' and reason = 'Confirmed'), 'unchanged fees are logged as confirmed');

-- 6. staff change an agent-confirmed fee: a reason is required, the agent is not asked to re-approve
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"commission":{"basis":"percent","percent":"2.75"},"admin":{"amount":"395"},"other":[{"description":"Referral fee","amount":"500","paidTo":"ABC Referrals"},{"description":"Transaction fee","amount":"150.50","paidTo":"Bright Realty"}]}')$q$)
  = 'The agent confirmed these fees. Enter a reason for the change.', 'staff change to an agent-confirmed fee without a reason: refused');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"commission":{"basis":"percent","percent":"2.5"},"admin":{"amount":"395"},"other":[{"description":"Referral fee","amount":"500","paidTo":"ABC Referrals"}]}')$q$)
  = 'The agent confirmed these fees. Enter a reason for the change.', 'staff removing an agent-confirmed fee without a reason: refused');
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer',
  '{"commission":{"basis":"percent","percent":"2.75"},"admin":{"amount":"395"},"other":[{"description":"Referral fee","amount":"500","paidTo":"ABC Referrals"},{"description":"Transaction fee","amount":"150.50","paidTo":"Bright Realty"}]}', 'Per the signed commission agreement');
reset role;
select pg_temp.ok((select amount = 8250 and source = 'staff' and confirmed_role = 'agent' from public.deal_agent_fees where side = 'buyer' and kind = 'commission'),
  'staff change saved with a reason; the agent''s confirmation record stays (no re-approval)');
select pg_temp.ok((select reason = 'Per the signed commission agreement' and source = 'staff' and changed_by = '00000000-0000-0000-0000-0000000000a1'
  from public.deal_agent_fee_log where side = 'buyer' and kind = 'commission' order by id desc limit 1), 'history: who, reason, source staff');
select pg_temp.ok((select count(*) = 0 from public.deal_agent_fee_log where side = 'buyer' and kind <> 'commission' and source = 'staff' and old_value is not null), 'unchanged fees are not logged as staff changes');
-- staff changing an unconfirmed fee needs no reason
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'listing', '{"commission":{"basis":"amount","amount":"7777.77"},"admin":{"amount":"300","payer":"buyer"}}');
reset role;
select pg_temp.ok((select amount = 300 and payer = 'buyer' from public.deal_agent_fees where side = 'listing' and kind = 'admin'), 'unconfirmed fee: staff change with no reason; admin payer changed to buyer for this file');

-- 7. a TC on the listing agent's team confirms the listing side; they can't touch the buyer side; another TC can't either
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select count(*) from public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'listing', '{"commission":{"basis":"amount","amount":"7777.77"},"admin":{"amount":"300","payer":"buyer"}}');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'buyer', '{"admin":{"amount":"1"}}')$q$)
  = 'You can''t change agent fees on this file.', 'the TC can''t change the other agent''s side');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
select pg_temp.ok(pg_temp.err($q$select public.save_agent_fees('22222222-2222-2222-2222-222222222222', 'listing', '{"admin":{"amount":"1"}}')$q$)
  = 'You can''t change agent fees on this file.', 'a TC who doesn''t work for the agent can''t change their fees');
reset role;
select pg_temp.ok((select bool_and(confirmed_role = 'tc' and source = 'tc') from public.deal_agent_fees where side = 'listing'), 'TC confirmation is logged as Confirmed by TC');

-- 8. the sales price changes: % basis keeps the %, $ basis keeps the $, both stay in step
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.deals set purchase_price = 320000 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok((select amount = 8800 and pct = 2.75 from public.deal_agent_fees where side = 'buyer' and kind = 'commission'), 'price $320,000: buyer side 2.75% = $8,800');
select pg_temp.ok((select amount = 7777.77 and round(320000 * pct / 100, 2) = 7777.77 from public.deal_agent_fees where side = 'listing' and kind = 'commission'), 'price $320,000: listing side keeps $7,777.77 and its % follows');
select pg_temp.ok((select count(*) = 2 from public.deal_agent_fee_log where source = 'system' and reason = 'Sales price changed from $300,000.00 to $320,000.00'), 'price change is in the history');
update public.deals set purchase_price = 5000 where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok((select basis = 'percent' and round(5000 * pct / 100, 2) = amount from public.deal_agent_fees where side = 'listing' and kind = 'commission'),
  'a fixed $ commission bigger than the new price switches to keeping its % (still in step)');
select pg_temp.ok((select bool_and(round(d.purchase_price * f.pct / 100, 2) = f.amount) from public.deal_agent_fees f join public.deals d on d.id = f.deal_id where f.kind = 'commission'),
  'every commission: % and $ agree with the sales price');
SQL
psql_super -f "$ROOT/supabase/rollbacks/20261118010000_agent_fee_sides.sql"
psql_super -f "$ROOT/supabase/rollbacks/20261117100000_agent_fees.sql"
psql_super -c "do \$\$ begin if to_regclass('public.deal_agent_fees') is not null or to_regprocedure('public.save_agent_fees(uuid,text,jsonb,text)') is not null then raise exception 'FAIL rollback'; end if; raise notice 'PASS  rollback removes the tables and functions'; end \$\$;"
echo "agent fees SQL checks passed"
