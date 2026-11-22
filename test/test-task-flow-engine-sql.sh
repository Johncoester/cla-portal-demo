#!/bin/sh
# TB-1 + TB-2 Task Builder (John, Nov 13 2026). Disposable database only: applies
# supabase/migrations/20261120010000_task_builder_flows.sql and 20261121010000_task_flow_engine.sql on a small stand-in
# schema (deals, participants, contacts, sales people, tasks, a pg_cron stand-in) and checks the rules, then the rollbacks.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_task_flows_$$
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
  processor_id uuid, preprocessor_user_id uuid, tc_user_id uuid);
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
q -f "$ROOT/supabase/migrations/20261120010000_task_builder_flows.sql" >/dev/null 2>&1
q -f "$ROOT/supabase/migrations/20261121010000_task_flow_engine.sql" >/dev/null 2>&1
A=00000000-0000-0000-0000-00000000000a
P=00000000-0000-0000-0000-00000000000b
ok "$(val "select count(*) from cron.job where jobname = 'task-flows-every-15-min' and command = 'select private.run_task_flows()'")" 1 'the 15-minute job is scheduled'

# --- who and what
err "$P" "select public.save_task_flow_v2(null, 'Sneaky', '', 'order_opened', null, '{}', '[]')" 'Only an Admin or Super admin' 'a Processor cannot save a flow'
err "$A" "select public.save_task_flow_v2(null, 'Bad step', '', 'order_opened', null, '{}', '[{\"type\":\"create_task\",\"title\":\"x\",\"assignTo\":\"Processor\",\"dueDays\":1}]')" 'Step 1: give the task a name' 'a short task name is refused, naming the step'
err "$A" "select public.save_task_flow_v2(null, 'Bad who', '', 'order_opened', null, '{}', '[{\"type\":\"create_task\",\"title\":\"Order HOA docs\",\"assignTo\":\"Janitor\",\"dueDays\":1}]')" 'Step 1: choose who the task is for' 'an unknown role is refused'
err "$A" "select public.save_task_flow_v2(null, 'Bad wait', '', 'order_opened', null, '{}', '[{\"type\":\"wait\",\"days\":0}]')" 'Step 1: wait must be' 'a zero-day wait is refused'
FLOW=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'EMD reminder', 'Chase it', 'emd_not_received', 2, '{\"transactionTypes\":[\"Purchase\"],\"states\":[\"MD\",\"XX\"]}',
  '[{\"type\":\"create_task\",\"title\":\"Chase the EMD\",\"assignTo\":\"Buyer Agent\",\"dueDays\":1},{\"type\":\"wait\",\"days\":1},{\"type\":\"stop_if_emd_received\"},{\"type\":\"call_task\",\"title\":\"Call about the EMD\",\"assignTo\":\"Processor\",\"dueDays\":0}]')" | tail -1)
ok "$(val "select conditions->>'states' from public.task_flows where id = '$FLOW'")" '["MD"]' 'an unknown state is dropped from the conditions'
ok "$(val "select detail from public.task_flow_log where flow_id = '$FLOW'")" 'Starts: EMD not received, 2 days after the order was opened. Off. 4 steps.' 'the history counts the steps'
EMPTY=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Nothing yet', '', 'order_opened', null, '{}', '[]')" | tail -1)
err "$A" "select public.set_task_flow_active('$EMPTY', true)" 'Add at least one' 'a flow with no task step cannot be turned on'
LATER=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Contract in', '', 'contract_received', null, '{}', '[{\"type\":\"create_task\",\"title\":\"Review the contract\",\"assignTo\":\"Processor\",\"dueDays\":1}]')" | tail -1)
err "$A" "select public.set_task_flow_active('$LATER', true)" 'cannot be turned on yet' 'a contract-received flow cannot be turned on yet'
q -c "set app.uid = '$A'; select public.set_task_flow_active('$FLOW', true);" >/dev/null
err "$A" "select public.save_task_flow_v2('$FLOW', 'EMD reminder', 'Chase it', 'emd_not_received', 2, '{}', '[]')" 'Add at least one' 'an On flow cannot lose its last task step'

# --- the engine: EMD not received, 2 days after opened
q <<'SQL'
insert into public.deals values ('20000000-0000-0000-0000-000000000001', 'MD-1', 'Open', 'Purchase', 300000, 'MD', current_date - 3, null, false),
  ('20000000-0000-0000-0000-000000000002', 'VA-2', 'Open', 'Purchase', 300000, 'VA', current_date - 3, null, false),
  ('20000000-0000-0000-0000-000000000003', 'MD-3', 'Closed', 'Purchase', 300000, 'MD', current_date - 3, null, false),
  ('20000000-0000-0000-0000-000000000004', 'MD-4', 'Open', 'Purchase', 300000, 'MD', current_date - 1, null, false);
insert into public.deal_participants (deal_id, contact_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000d', 'Buyer Agent'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000e', 'Buyer Agent'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'Processor');
SQL
err "$P" "select public.run_task_flows_now()" 'Only an Admin or Super admin' 'a Processor cannot run the check'
ok "$(val "set app.uid = '$A'; select public.run_task_flows_now()" | tail -1)" '{"tasks": 2, "started": 2}' 'the check starts MD-1 and VA-2 (open, 2+ days) and makes 2 tasks'
ok "$(val "select string_agg(d.file_number || ':' || r.status, ',' order by d.file_number) from public.task_flow_runs r join public.deals d on d.id = r.deal_id")" 'MD-1:waiting,VA-2:skipped' 'VA-2 is skipped by the state condition; MD-1 waits; MD-3 (closed) and MD-4 (1 day) never start'
ok "$(val "select count(*) || ' ' || min(due_date - current_date) || ' ' || count(owner_profile_id) from public.tasks where title = 'Chase the EMD'")" '2 1 1' 'one task per buyer agent, due tomorrow; only the one with a login has an owner'
ok "$(val "select count(*) from public.notices where title = 'New task: Chase the EMD'")" 1 'the agent with a login is told'
ok "$(val "select private.run_task_flows()")" '{"tasks": 0, "started": 0}' 'running again before the wait is over does nothing'
q -c "update public.task_flow_runs set next_at = now() - interval '1 minute' where status = 'waiting';" >/dev/null
ok "$(val "select private.run_task_flows()")" '{"tasks": 1, "started": 0}' 'after the wait, the EMD is still missing, so the processor gets the call task'
ok "$(val "select r.status from public.task_flow_runs r join public.deals d on d.id = r.deal_id where d.file_number = 'MD-1'")" done 'the run finishes'
ok "$(val "select description from public.tasks where title = 'Call about the EMD'")" 'Phone call. Added by the "EMD reminder" flow (Task Builder).' 'the call task says where it came from'

# --- stop if EMD received; order opened; closing date
q -c "update public.deals set open_date = current_date - 5 where file_number = 'MD-4';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
q -c "update public.deals set emd_received = true where file_number = 'MD-4'; update public.task_flow_runs set next_at = now() - interval '1 minute' where status = 'waiting';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
ok "$(val "select r.status from public.task_flow_runs r join public.deals d on d.id = r.deal_id where d.file_number = 'MD-4'")" stopped 'once the EMD is received, the flow stops before the call task'
OPEN=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Welcome call', '', 'order_opened', null, '{\"transactionTypes\":[\"Cash purchase\"]}', '[{\"type\":\"call_task\",\"title\":\"Welcome call to the buyer agent\",\"assignTo\":\"Buyer Agent\",\"dueDays\":0}]')" | tail -1)
q -c "set app.uid = '$A'; select public.set_task_flow_active('$OPEN', true);" >/dev/null
q -c "insert into public.deals (id, file_number, loan_amount, state) values ('20000000-0000-0000-0000-000000000005', 'MD-5', null, 'MD');
  insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-00000000000d', 'Buyer Agent');" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs where flow_id = '$OPEN'")" 1 'placing an order starts the order-opened flow'
q -c "select private.run_task_flows();" >/dev/null
ok "$(val "select count(*) from public.tasks where title = 'Welcome call to the buyer agent'")" 1 'the next check creates the task for the agent added after the order'
CL=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Closing set', '', 'closing_date_set', null, '{}', '[{\"type\":\"create_task\",\"title\":\"Confirm closing time\",\"assignTo\":\"Processor\",\"dueDays\":2}]')" | tail -1)
q -c "set app.uid = '$A'; select public.set_task_flow_active('$CL', true);" >/dev/null
q -c "update public.deals set closing_date = current_date + 20 where file_number = 'MD-1';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
q -c "update public.deals set closing_date = current_date + 25 where file_number = 'MD-1';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
ok "$(val "select count(*) from public.tasks where title = 'Confirm closing time'")" 2 'a changed closing date starts the closing flow again'
q -c "update public.deals set processor_id = '$P' where file_number = 'MD-4'; update public.deals set closing_date = current_date + 9, emd_received = false, status = 'Open' where file_number = 'MD-4';" >/dev/null
q -c "select private.run_task_flows();" >/dev/null
ok "$(val "select count(*) || ' ' || count(*) filter (where participant_id is null and owner_profile_id = '$P') from public.tasks t join public.deals d on d.id = t.deal_id where d.file_number = 'MD-4' and t.title = 'Confirm closing time'")" '1 1' 'with no Processor in the party list, the processor set on the order gets the task'

# --- an engine problem never stops an order from saving
q -c "alter table public.task_flow_runs add constraint boom check (false) not valid;" >/dev/null
q -c "insert into public.deals (id, file_number, state) values ('20000000-0000-0000-0000-000000000006', 'MD-6', 'MD');" >/dev/null
ok "$(val "select count(*) from public.deals where file_number = 'MD-6'")" 1 'the order still saves when the engine fails'
ok "$(val "select count(*) from public.task_flow_errors")" 1 'and the problem is written down'
q -c "alter table public.task_flow_runs drop constraint boom;" >/dev/null
ok "$(val "set role authenticated; select count(*) from public.task_flow_runs" 2>&1 | grep -c 'permission denied')" 1 'nobody reads runs directly'
ok "$(val "set app.uid = '$A'; select jsonb_array_length(public.list_task_flows()->'runs')" | tail -1)" 7 'the page lists the runs (MD-6 never started)'

# --- rollbacks
q -f "$ROOT/supabase/rollbacks/20261121010000_task_flow_engine.sql" >/dev/null 2>&1
ok "$(val "select (select count(*) from cron.job) || ' ' || (to_regclass('public.task_flow_runs') is null) || ' ' || (select count(*) from pg_trigger where tgname = 'zz_task_flow_events')")" '0 true 0' 'the engine rollback stops the job and removes the trigger and runs'
ok "$(val "select count(*) from public.tasks")" 7 'tasks already made stay on their files'
q -f "$ROOT/supabase/migrations/20261121010000_task_flow_engine.sql" >/dev/null 2>&1
q -f "$ROOT/supabase/rollbacks/20261121010000_task_flow_engine.sql" >/dev/null 2>&1
q -f "$ROOT/supabase/rollbacks/20261120010000_task_builder_flows.sql" >/dev/null 2>&1
ok "$(val "select to_regclass('public.task_flows') is null")" t 'both rollbacks apply cleanly after a re-apply'
[ "$fail" = 0 ] && echo "all passed"
exit $fail
