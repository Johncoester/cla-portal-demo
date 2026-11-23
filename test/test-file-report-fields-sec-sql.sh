#!/bin/sh
# RPT-1-SEC (John, Nov 23 2026): a demo Processor must get no real files from crm_deal_report_fields().
# Disposable database only: a small stand-in schema, the original RPT-1 file, this security file,
# the checks, and the rollback. Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_rpt1sec_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
err() { out=$(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "$1" 2>&1 || true)
  case "$out" in *"$2"*) echo "ok $3";; *) echo "FAIL $3: $out"; fail=1;; esac; }
as() { who=$1; shift; val "set test.uid = '$who'; $1"; }

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema private;

create table public.profiles (
  id uuid primary key,
  first_name text default '',
  last_name text default '',
  role text,
  is_admin boolean not null default false,
  is_demo boolean not null default false,
  status text not null default 'active'
);
create table public.deals (
  id uuid primary key,
  file_number text,
  state text,
  zip text,
  lender_name text,
  contract_date date,
  stage int,
  processor_id uuid,
  preprocessor_user_id uuid,
  tc_user_id uuid,
  closer_name text,
  is_demo boolean not null default false
);
create table public.contacts (
  id uuid primary key,
  first_name text not null default '',
  last_name text not null default '',
  company text,
  mobile text,
  phone text,
  email text
);
create table public.deal_participants (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  contact_id uuid not null references public.contacts(id),
  role text not null,
  created_at timestamptz not null default now()
);
create table public.deal_business_sources (
  deal_id uuid primary key references public.deals(id),
  source text
);
create table public.deal_sales_people (
  deal_id uuid not null references public.deals(id),
  sales_id uuid not null,
  primary key (deal_id, sales_id)
);

create function private.effective_uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function private.me_role() returns text language sql stable as $$
  select p.role from public.profiles p where p.id = private.effective_uid()
$$;
create function private.is_admin() returns boolean language sql stable as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = private.effective_uid()), false)
$$;
create function private.viewer_is_demo() returns boolean language sql stable as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = private.effective_uid()), false)
$$;
create function private.crm_user() returns boolean language sql stable as $$
  select coalesce(private.me_role() in ('Admin', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team'), false)
$$;
create function private.crm_deal_scope_all() returns boolean language sql stable as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Sales Team', 'Preprocessor'), false)
$$;
create function private.can_access_deal(d uuid) returns boolean language sql stable as $$
  select private.me_role() is not null and (
    private.is_admin() or private.me_role() in ('Processor', 'Sales Team', 'Transaction Coordinator')
    or (private.me_role() = 'Preprocessor' and exists (select 1 from public.deals x where x.id = d and x.preprocessor_user_id = private.effective_uid()))
    or (private.me_role() in ('Sales Person', 'Sales Team') and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid()))
  )
$$;
create function private.crm_deal_visible(d uuid) returns boolean language sql stable as $$
  select private.crm_user() and private.can_access_deal(d) and (private.crm_deal_scope_all()
    or (coalesce(private.me_role() = 'Sales Person', false) and exists (select 1 from public.deal_sales_people s where s.deal_id = d and s.sales_id = private.effective_uid())))
$$;
create function private.crm_name(p uuid) returns text language sql stable as $$
  select coalesce(btrim(x.first_name || ' ' || x.last_name), '') from public.profiles x where x.id = p
$$;
create function private.business_source_label(p_source text) returns text language sql stable as $$
  select case split_part(btrim(coalesce(p_source, '')), ':', 1)
    when 'buyer' then 'Buyer'
    when 'seller' then 'Seller'
    when 'buyer_agent' then 'Buyer''s agent'
    when 'listing_agent' then 'Listing agent'
    when 'lender' then 'Lender'
    when 'homeowner' then 'Homeowner'
    else btrim(coalesce(p_source, ''))
  end
  || case
    when split_part(btrim(coalesce(p_source, '')), ':', 1) in ('buyer', 'seller', 'buyer_agent', 'listing_agent', 'lender')
     and split_part(btrim(coalesce(p_source, '')), ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(' — ' || nullif((select btrim(c.first_name || ' ' || c.last_name) from public.contacts c where c.id = split_part(btrim(p_source), ':', 2)::uuid), ''), '')
    else ''
  end
$$;
create function private.crm_option_label(kind text, val text) returns text language sql stable as $$
  select val
$$;

grant execute on function private.effective_uid(), private.me_role(), private.is_admin(), private.viewer_is_demo(),
  private.crm_user(), private.crm_deal_scope_all(), private.can_access_deal(uuid), private.crm_deal_visible(uuid),
  private.crm_name(uuid), private.business_source_label(text), private.crm_option_label(text, text) to authenticated;

-- ids
-- real processor  11111111-1111-4111-8111-111111111111
-- demo processor  22222222-2222-4222-8222-222222222222
-- sales person    33333333-3333-4333-8333-333333333333
-- agent (no CRM)  44444444-4444-4444-8444-444444444444
-- real deal       55555555-5555-4555-8555-555555555555
-- demo deal       66666666-6666-4666-8666-666666666666
insert into public.profiles (id, first_name, last_name, role, is_demo) values
  ('11111111-1111-4111-8111-111111111111', 'Pat', 'Processor', 'Processor', false),
  ('22222222-2222-4222-8222-222222222222', 'Dee', 'Demo', 'Processor', true),
  ('33333333-3333-4333-8333-333333333333', 'Sam', 'Sales', 'Sales Person', false),
  ('44444444-4444-4444-8444-444444444444', 'Ava', 'Agent', 'Buyer Agent', false);

insert into public.deals (id, file_number, state, zip, lender_name, stage, processor_id, closer_name, is_demo) values
  ('55555555-5555-4555-8555-555555555555', 'MD-26-REAL', 'MD', '20850', 'Real Bank', 5, '11111111-1111-4111-8111-111111111111', 'Chris Closer', false),
  ('66666666-6666-4666-8666-666666666666', 'MD-26-DEMO', 'MD', '20852', 'Demo Bank', 2, '22222222-2222-4222-8222-222222222222', 'Dana Closer', true);

insert into public.contacts (id, first_name, last_name, company, mobile, phone, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Testy', 'Buyerman', null, null, null, 'testy@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Sally', 'Sellerton', null, null, null, 'sally@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Lisa', 'Listing', 'Listing Realty', '240-555-0111', '301-555-0100', 'lisa@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Dana', 'Demobuyer', null, null, null, 'dana@example.test');

insert into public.deal_participants (deal_id, contact_id, role) values
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Client-Buyer'),
  ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Client-Seller'),
  ('55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Listing Agent'),
  ('66666666-6666-4666-8666-666666666666', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Client-Buyer');

insert into public.deal_business_sources (deal_id, source) values
  ('55555555-5555-4555-8555-555555555555', 'listing_agent:cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SQL

q -f "$ROOT/supabase/migrations/20261129010000_crm_deal_report_fields.sql"

# The hole this fix closes: a demo Processor sees the real file under the original DEFINER function.
REAL=55555555-5555-4555-8555-555555555555
DEMO=66666666-6666-4666-8666-666666666666
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "1" "before the fix, a demo Processor can read the real file (the hole)"
ok "$(as 22222222-2222-4222-8222-222222222222 "select x->>'buyerNames' from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "Testy Buyerman" "before the fix, that row includes the real buyer's name"

q -f "$ROOT/supabase/migrations/20261129060000_crm_deal_report_fields_sec.sql"

ok "$(val "select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'crm_deal_report_fields';")" "false" "after the fix, crm_deal_report_fields is SECURITY INVOKER"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "0" "a demo Processor gets 0 rows from real files"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$DEMO';")" "1" "a demo Processor still sees the demo file"
ok "$(as 11111111-1111-4111-8111-111111111111 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "1" "a real Processor still sees the real file"
ok "$(as 11111111-1111-4111-8111-111111111111 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$DEMO';")" "0" "a real Processor does not see the demo file"
ok "$(as 11111111-1111-4111-8111-111111111111 "select (x->>'buyerNames') || '|' || (x->>'listingAgentPhone') || '|' || (x->>'sourceOfBusiness') from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "Testy Buyerman|240-555-0111|Listing agent — Lisa Listing" "a real Processor still gets buyer, agent phone and source label"
ok "$(as 33333333-3333-4333-8333-333333333333 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x;")" "0" "a Sales Person who is not on either file gets no rows"
err "set test.uid = '44444444-4444-4444-8444-444444444444'; select public.crm_deal_report_fields();" "The CRM is for CLA staff only." "a buyer agent is refused"
ok "$(val "select has_function_privilege('anon', 'public.crm_deal_report_fields()', 'execute')::text;")" "false" "anon cannot run the function"

q -f "$ROOT/supabase/rollbacks/20261129060000_crm_deal_report_fields_sec.sql"
ok "$(val "select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'crm_deal_report_fields';")" "true" "rollback restores the SECURITY DEFINER function"
ok "$(val "select to_regprocedure('private.crm_visible_deal_ids()') is null::text;")" "true" "rollback drops the visible-files helper"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "1" "after rollback, the demo Processor can read the real file again (local test only)"

# Re-apply the original then the fix (the security file drops and recreates).
q -f "$ROOT/supabase/rollbacks/20261129010000_crm_deal_report_fields.sql"
q -f "$ROOT/supabase/migrations/20261129010000_crm_deal_report_fields.sql"
q -f "$ROOT/supabase/migrations/20261129060000_crm_deal_report_fields_sec.sql"
ok "$(as 22222222-2222-4222-8222-222222222222 "select count(*)::text from jsonb_array_elements(public.crm_deal_report_fields()) x where x->>'id' = '$REAL';")" "0" "re-applying the fix again leaves the demo Processor with 0 real-file rows"

if [ "$fail" -ne 0 ]; then echo "$fail failed"; exit 1; fi
echo "file report fields sec sql passed"
