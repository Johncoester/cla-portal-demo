#!/bin/sh
# Task Builder, Nov 14 2026 (John): "new files only" / "existing open files too" and "Try on one file". Disposable database only:
# applies the TB-1, TB-2 and 20261122010000_task_flow_try_and_scope.sql migrations on a small stand-in schema and checks the rules,
# then the rollback.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_task_flow_try_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
err() { out=$(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "set app.uid = '$1'; $2" 2>&1 || true)
  case "$out" in *"$3"*) echo "ok $4";; *) echo "FAIL $4: $out"; fail=1;; esac; }

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema private; create schema extensions; create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(p_name text, p_sched text, p_cmd text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (p_name, p_sched, p_cmd) returning jobid $$;
create function cron.unschedule(p_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = p_id returning true $$;
create table public.profiles (id uuid primary key, first_name text, last_name text, admin boolean default false);
create table public.contacts (id uuid primary key, profile_id uuid, title text);
create table public.deals (id uuid primary key, file_number text, status text default 'Open', transaction_type text default 'Purchase', loan_amount numeric,
  state text, open_date date default current_date, closing_date date, emd_received boolean default false,
  processor_id uuid, preprocessor_user_id uuid, tc_user_id uuid, created_at timestamptz not null default now());
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid references public.deals(id), contact_id uuid, role text);
create table public.deal_sales_people (deal_id uuid, sales_id uuid);
create table public.tasks (id uuid primary key default gen_random_uuid(), deal_id uuid not null, title text not null, description text not null default '',
  assigned_role text not null default 'Processor', status text not null default 'todo', due_date date, due_overridden boolean default false, created_by uuid,
  created_at timestamptz default now(), kind text default 'simple', participant_id uuid, owner_profile_id uuid);
create table public.notices (owners uuid[], title text);
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function private.is_admin() returns boolean language sql stable as $$ select coalesce((select admin from public.profiles where id = private.effective_uid()), false) $$;
create function private.person_name(uuid) returns text language sql stable as $$ select first_name || ' ' || last_name from public.profiles where id = $1 $$;
create function private.view_as_readonly() returns trigger language plpgsql as $$ begin return coalesce(new, old); end $$;
create function private.notify(uuid[], text, uuid, text, text) returns void language sql as $$ insert into public.notices values ($1, $4) $$;
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a', 'Adam', 'Admin', true), ('00000000-0000-0000-0000-00000000000b', 'Pat', 'Processor', false),
  ('00000000-0000-0000-0000-00000000000c', 'Sam', 'Sales', false), ('00000000-0000-0000-0000-00000000000d', 'Bea', 'Agent', false);
insert into public.contacts values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Mr'),
  ('10000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', null), ('10000000-0000-0000-0000-00000000000e', null, null);
SQL
for m in 20261120010000_task_builder_flows 20261121010000_task_flow_engine 20261122010000_task_flow_try_and_scope; do q -f "$ROOT/supabase/migrations/$m.sql" >/dev/null 2>&1; done
A=00000000-0000-0000-0000-00000000000a
P=00000000-0000-0000-0000-00000000000b
ok "$(val "select count(*) from information_schema.columns where table_name = 'task_flows' and column_name in ('scope', 'activated_at')")" 2 'flows have which files (scope) and when they were turned on'

q <<'SQL'
insert into public.deals (id, file_number, loan_amount, state, open_date, created_at) values
  ('20000000-0000-0000-0000-000000000001', 'OLD-1', 300000, 'MD', current_date - 5, now() - interval '5 days'),
  ('20000000-0000-0000-0000-000000000002', 'OLD-2', 300000, 'MD', current_date - 5, now() - interval '5 days');
insert into public.deals (id, file_number, status, loan_amount, state, open_date, created_at) values
  ('20000000-0000-0000-0000-000000000009', 'CLOSED-9', 'Closed', 300000, 'MD', current_date - 5, now() - interval '5 days');
insert into public.deal_participants (deal_id, contact_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000d', 'Buyer Agent'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'Processor');
SQL
STEPS='[{"type":"create_task","title":"Chase the EMD","assignTo":"Buyer Agent","dueDays":1},{"type":"wait","days":1},{"type":"stop_if_emd_received"},{"type":"call_task","title":"Call about the EMD","assignTo":"Processor","dueDays":0}]'
FLOW=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'EMD reminder', '', 'emd_not_received', 2, '{}', '$STEPS')" | tail -1)

# --- Try on one file (flow is Off)
err "$P" "select public.try_task_flow_on_file('$FLOW', '20000000-0000-0000-0000-000000000001')" 'Only an Admin or Super admin' 'a Processor cannot try a flow'
err "$A" "select public.try_task_flow_on_file('$FLOW', '20000000-0000-0000-0000-000000000009')" 'That file is not open' 'a closed file is refused in plain words'
TRY=$(val "set app.uid = '$A'; select public.try_task_flow_on_file('$FLOW', '20000000-0000-0000-0000-000000000001')" | tail -1)
ok "$(echo "$TRY" | grep -o '"status": "[a-z]*"')" '"status": "done"' 'a test run finishes at once, even with the flow Off'
ok "$(echo "$TRY" | grep -o '"tasks": [0-9]*')" '"tasks": 2' 'it makes the task and, with waits skipped, the call task'
ok "$(echo "$TRY" | grep -c 'skipped in a test run')" 1 'the wait is shown as skipped'
ok "$(val "select count(*) from public.tasks where description like 'Test run. %'")" 2 'its tasks are marked Test run'
ok "$(val "select private.task_flow_advance(id) from public.task_flow_runs where trial limit 1" | tail -1)" 0 'a finished test run does nothing more'

# --- turn on: new files only (default) leaves old files alone
q -c "set app.uid = '$A'; select public.set_task_flow_active_scoped('$FLOW', true, 'new');" >/dev/null
ok "$(val "select scope || ' ' || (activated_at is not null) from public.task_flows where id = '$FLOW'")" 'new true' 'turning on records new files only and when'
ok "$(val "select detail from public.task_flow_log where flow_id = '$FLOW' and action = 'turned on'")" 'New files only.' 'History says new files only'
ok "$(val "select private.run_task_flows()")" '{"tasks": 0, "started": 0}' 'new files only: the 2 old open files get nothing'
q -c "insert into public.deals (id, file_number, loan_amount, state, open_date) values ('20000000-0000-0000-0000-000000000003', 'NEW-3', 300000, 'MD', current_date - 3);
  insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000d', 'Buyer Agent');" >/dev/null
ok "$(val "select private.run_task_flows()")" '{"tasks": 1, "started": 1}' 'a file opened after turning on does get it'

# --- existing open files too
q -c "set app.uid = '$A'; select public.set_task_flow_active_scoped('$FLOW', false, 'new'); select public.set_task_flow_active_scoped('$FLOW', true, 'all');" >/dev/null
ok "$(val "select detail from public.task_flow_log where flow_id = '$FLOW' and action = 'turned on' order by id desc limit 1")" 'New and existing open files.' 'History says new and existing'
ok "$(val "select private.run_task_flows()")" '{"tasks": 1, "started": 2}' 'existing too: OLD-1 and OLD-2 start; the test run on OLD-1 did not block its real run'
ok "$(val "select count(*) from public.task_flow_runs r join public.deals d on d.id = r.deal_id where d.file_number = 'OLD-1' and not r.trial and r.status = 'waiting'")" 1 'OLD-1 has its real run waiting'
q -c "set app.uid = '$A'; select public.set_task_flow_active('$FLOW', false); select public.set_task_flow_active('$FLOW', true);" >/dev/null
ok "$(val "select scope from public.task_flows where id = '$FLOW'")" new 'the old two-part switch now means new files only'

# --- order opened always means new orders; a test run never blocks a closing-date restart
CL=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Closing set', '', 'closing_date_set', null, '{}', '[{\"type\":\"create_task\",\"title\":\"Confirm closing time\",\"assignTo\":\"Processor\",\"dueDays\":2}]')" | tail -1)
q -c "set app.uid = '$A'; select public.try_task_flow_on_file('$CL', '20000000-0000-0000-0000-000000000001'); select public.set_task_flow_active_scoped('$CL', true, 'all');" >/dev/null
q -c "update public.deals set closing_date = current_date + 20 where file_number = 'OLD-1';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
ok "$(val "select count(*) from public.tasks where title = 'Confirm closing time' and description not like 'Test run.%'")" 1 'after a test run, a closing date change still starts the real run'
ok "$(val "set app.uid = '$A'; select count(*) from jsonb_array_elements(public.list_task_flows()->'runs') r where (r->>'trial')::boolean" | tail -1)" 2 'the page sees which runs were tests'

# --- rollback
q -f "$ROOT/supabase/rollbacks/20261122010000_task_flow_try_and_scope.sql" >/dev/null 2>&1
ok "$(val "select (to_regprocedure('public.try_task_flow_on_file(uuid,uuid)') is null) || ' ' || (select count(*) from information_schema.columns where table_name in ('task_flows', 'task_flow_runs') and column_name in ('scope', 'activated_at', 'trial')) || ' ' || (to_regprocedure('public.set_task_flow_active(uuid,boolean)') is not null)")" 'true 0 true' 'the rollback removes scope, test runs and Try on one file, and keeps the On / Off switch'
ok "$(val "select count(*) from public.tasks where description like 'Test run. %'")" 3 'tasks made by test runs stay on their files'
q -f "$ROOT/supabase/migrations/20261122010000_task_flow_try_and_scope.sql" >/dev/null 2>&1
ok "$(val "select scope from public.task_flows where name = 'EMD reminder'")" all 'a flow that was On before this file keeps running on existing files'
[ "$fail" = 0 ] && echo "all passed"
exit $fail
