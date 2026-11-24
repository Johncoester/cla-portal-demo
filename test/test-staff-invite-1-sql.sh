#!/bin/sh
# STAFF-INVITE-1 (John Coester, chat Nov 23 2026 5:07 PM ET): private.can_invite_agents allows every
# CLA Title employee role that can open orders, and still refuses outside and HR-only roles.
# Disposable database only. Does not connect to the hosted TEST project and does not send mail.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_staff_invite_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
err() { out=$(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "$1" 2>&1 || true)
  case "$out" in *"$2"*) echo "ok $3";; *) echo "FAIL $3: $out"; fail=1;; esac; }

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema private; create schema extensions;
create table public.profiles (
  id uuid primary key,
  first_name text default '',
  last_name text default '',
  email text,
  status text not null default 'active',
  role text,
  is_admin boolean not null default false
);
create function private.effective_uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
create function private.me_role() returns text language sql stable security definer as $$
  select role from public.profiles where id = private.effective_uid()
$$;
create function private.is_admin() returns boolean language sql stable security definer as $$
  select coalesce((select is_admin from public.profiles where id = private.effective_uid() and status = 'active'), false)
$$;
create function private.can_invite_agents()
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin', 'Super admin'), false) $function$;
revoke all on function private.can_invite_agents() from public, anon;
grant execute on function private.can_invite_agents() to authenticated;
insert into public.profiles (id, first_name, last_name, email, role, is_admin, status) values
  ('00000000-0000-0000-0000-000000000001', 'Pat', 'Processor', 'proc@clatitle.com', 'Processor', false, 'active'),
  ('00000000-0000-0000-0000-000000000002', 'Pam', 'Preproc', 'pre@clatitle.com', 'Preprocessor', false, 'active'),
  ('00000000-0000-0000-0000-000000000003', 'Sam', 'Sales', 'sales@clatitle.com', 'Sales Person', false, 'active'),
  ('00000000-0000-0000-0000-000000000004', 'Sue', 'Team', 'team@clatitle.com', 'Sales Team', false, 'active'),
  ('00000000-0000-0000-0000-000000000005', 'Terry', 'Coord', 'tc@clatitle.com', 'Transaction Coordinator', false, 'active'),
  ('00000000-0000-0000-0000-000000000006', 'Ada', 'Admin', 'admin@clatitle.com', 'Admin', true, 'active'),
  ('00000000-0000-0000-0000-000000000007', 'Sid', 'Super', 'super@clatitle.com', 'Super admin', true, 'active'),
  ('00000000-0000-0000-0000-000000000008', 'Eli', 'Employee', 'eli@clatitle.com', 'Employee', false, 'active'),
  ('00000000-0000-0000-0000-000000000009', 'Bea', 'Buyer', 'bea@outside.test', 'Outside user', false, 'active'),
  ('00000000-0000-0000-0000-00000000000a', 'Ann', 'Agent', 'ann@outside.test', 'Outside user', false, 'active'),
  ('00000000-0000-0000-0000-00000000000b', 'Len', 'Lender', 'len@outside.test', 'Outside user', false, 'active'),
  ('00000000-0000-0000-0000-00000000000c', 'Old', 'Proc', 'old@clatitle.com', 'Processor', false, 'removed');
SQL

as() { who=$1; shift; val "set test.uid = '$who'; $1"; }
can() { as "$1" "select private.can_invite_agents()::text"; }

ok "$(val "select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='private' and p.proname='can_invite_agents'")" "44c379d3ed83df27959587cac0da69ec" "fixture body matches the live TEST fingerprint"

# before the change a CLA staff Transaction Coordinator cannot invite
ok "$(can 00000000-0000-0000-0000-000000000005)" "false" "before: a CLA Transaction Coordinator cannot invite"
ok "$(can 00000000-0000-0000-0000-000000000001)" "true" "before: a Processor can invite"

q -f "$ROOT/supabase/migrations/20261129120000_staff_invite_cla_employees.sql"
ok "$(val "select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='private' and p.proname='can_invite_agents'")" "afb2be409dc4d683382ed7f79541dcea" "migration body matches the new fingerprint"
q -f "$ROOT/supabase/migrations/20261129120000_staff_invite_cla_employees.sql"
ok true true "the migration can be applied a second time (already-applied is a no-op)"

ok "$(can 00000000-0000-0000-0000-000000000001)" "true" "Processor may invite"
ok "$(can 00000000-0000-0000-0000-000000000002)" "true" "Preprocessor may invite"
ok "$(can 00000000-0000-0000-0000-000000000003)" "true" "Sales Person may invite"
ok "$(can 00000000-0000-0000-0000-000000000004)" "true" "Sales Team may invite"
ok "$(can 00000000-0000-0000-0000-000000000005)" "true" "CLA Transaction Coordinator may invite"
ok "$(can 00000000-0000-0000-0000-000000000006)" "true" "Admin may invite"
ok "$(can 00000000-0000-0000-0000-000000000007)" "true" "Super admin may invite"

ok "$(can 00000000-0000-0000-0000-000000000008)" "false" "an HR-only Employee may not invite"
ok "$(can 00000000-0000-0000-0000-000000000009)" "false" "an outside buyer/seller login may not invite"
ok "$(can 00000000-0000-0000-0000-00000000000a)" "false" "an outside agent login may not invite"
ok "$(can 00000000-0000-0000-0000-00000000000b)" "false" "an outside lender login may not invite"
ok "$(can 00000000-0000-0000-0000-00000000000c)" "true" "SQL still keys off role, not status: a removed Processor is blocked in the UI (status !== removed), not in can_invite_agents"
ok "$(can 00000000-0000-0000-0000-000000000099)" "false" "an unknown login may not invite"

# drift: a different body is refused, and nothing is changed
q <<'SQL'
create or replace function private.can_invite_agents() returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions' as $function$ select false $function$;
SQL
err "\i $ROOT/supabase/migrations/20261129120000_staff_invite_cla_employees.sql" "drift: private.can_invite_agents is not the expected live body" "pre-flight stops on a drifted body"
ok "$(val "select p.prosrc ~ 'select false' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='private' and p.proname='can_invite_agents'")" "t" "a drifted pre-flight leaves the body unchanged"

# put the new body back and roll it back
q <<'SQL'
create or replace function private.can_invite_agents()
returns boolean language sql stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select coalesce(private.is_admin() or private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator', 'Admin', 'Super admin'), false) $function$;
revoke all on function private.can_invite_agents() from public, anon;
grant execute on function private.can_invite_agents() to authenticated;
SQL
q -f "$ROOT/supabase/rollbacks/20261129120000_staff_invite_cla_employees.sql"
ok "$(val "select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='private' and p.proname='can_invite_agents'")" "44c379d3ed83df27959587cac0da69ec" "rollback restores the live TEST fingerprint"
ok "$(can 00000000-0000-0000-0000-000000000005)" "false" "after rollback a CLA Transaction Coordinator cannot invite"
q -f "$ROOT/supabase/migrations/20261129120000_staff_invite_cla_employees.sql"
ok "$(can 00000000-0000-0000-0000-000000000005)" "true" "re-applying after rollback allows a CLA Transaction Coordinator again"

if [ "$fail" -ne 0 ]; then echo "FAIL $fail"; exit 1; fi
echo "all STAFF-INVITE-1 SQL checks passed"
