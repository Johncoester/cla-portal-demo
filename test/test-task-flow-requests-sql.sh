#!/bin/sh
# Task Builder TB-6, Nov 20 2026 (John): client requests ("Request a form from a party") and the ONE email per person and file.
# Disposable database only: applies TB-1, TB-2, the Nov 14 file and 20261126010000_task_flow_client_requests.sql on a small stand-in
# schema, checks the rules, then the rollback. Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_task_flow_req_$$
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
create schema private; create schema extensions; create schema cron;
create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(p_name text, p_sched text, p_cmd text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (p_name, p_sched, p_cmd) returning jobid $$;
create function cron.unschedule(p_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = p_id returning true $$;
create table public.profiles (id uuid primary key, first_name text, last_name text, admin boolean default false, email text, status text default 'active');
create table public.contacts (id uuid primary key, profile_id uuid, title text, first_name text, last_name text default '', email text default '');
create table public.deals (id uuid primary key, file_number text, status text default 'Open', transaction_type text default 'Purchase', loan_amount numeric,
  state text, open_date date default current_date, closing_date date, emd_received boolean default false, street text default '', city text default '',
  processor_id uuid, preprocessor_user_id uuid, tc_user_id uuid, created_at timestamptz not null default now());
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid references public.deals(id), contact_id uuid, role text);
create table public.deal_sales_people (deal_id uuid, sales_id uuid);
create table public.tasks (id uuid primary key default gen_random_uuid(), deal_id uuid not null, title text not null, description text not null default '',
  assigned_role text not null default 'Processor', status text not null default 'todo', due_date date, due_overridden boolean default false, created_by uuid,
  created_at timestamptz default now(), kind text default 'simple', participant_id uuid, owner_profile_id uuid,
  template_id uuid, template_code text, template_version int, lane text, audiences text[]);
create table public.task_templates (id uuid primary key default gen_random_uuid(), code text, version int, title text, description text default '', active boolean default true,
  retired_at timestamptz, lane text, audiences text[]);
create table public.task_template_switches (code text primary key, enabled boolean);
create function private.task_enabled(p_code text) returns boolean language sql stable as $$ select coalesce((select enabled from public.task_template_switches where code = p_code), true) $$;
create table public.outbox (id uuid primary key default gen_random_uuid(), to_profile_id uuid not null, to_email text not null, to_name text default '', subject text, body text,
  task_id uuid, deal_id uuid, created_by uuid, created_at timestamptz default now(), sender_type text, template_key text default '');
create table public.notices (owners uuid[], title text);
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function private.is_admin() returns boolean language sql stable as $$ select coalesce((select admin from public.profiles where id = private.effective_uid()), false) $$;
create function private.person_name(uuid) returns text language sql stable as $$ select first_name || ' ' || last_name from public.profiles where id = $1 $$;
create function private.view_as_readonly() returns trigger language plpgsql as $$ begin return coalesce(new, old); end $$;
create function private.notify(uuid[], text, uuid, text, text) returns void language sql as $$ insert into public.notices values ($1, $4) $$;
insert into public.profiles (id, first_name, last_name, admin, email) values ('00000000-0000-0000-0000-00000000000a', 'Adam', 'Admin', true, 'adam@cla.test'),
  ('00000000-0000-0000-0000-00000000000b', 'Bea', 'Buyer', false, 'bea@example.com');
insert into public.contacts (id, profile_id, first_name, last_name, email) values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bea', 'Buyer', 'bea@example.com'),
  ('10000000-0000-0000-0000-00000000000c', null, 'Sam', 'Seller', 'sam@example.com');
insert into public.deals (id, file_number, street, city) values ('20000000-0000-0000-0000-000000000001', 'MD-26-90001', '1 Main St', 'Bowie');
insert into public.deal_participants (id, deal_id, contact_id, role) values ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'Client-Buyer'),
  ('30000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000c', 'Client-Seller');
insert into public.task_templates (code, version, title) values ('personal_info', 8, 'Personal information'), ('id_upload', 2, 'Upload identification'), ('hoa_info', 2, 'Confirm HOA Information');
-- the buyer already has an open Personal information copy (made when they were added): the request uses it
insert into public.tasks (deal_id, title, kind, participant_id, owner_profile_id, template_code, assigned_role, due_date)
  values ('20000000-0000-0000-0000-000000000001', 'Personal information', 'form', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'personal_info', 'Client-Buyer', current_date + 7);
SQL
for m in 20261120010000_task_builder_flows 20261121010000_task_flow_engine 20261122010000_task_flow_try_and_scope 20261126010000_task_flow_client_requests; do
  q -f "$ROOT/supabase/migrations/$m.sql" >/dev/null; done
D=20000000-0000-0000-0000-000000000001

# checking a step
err "select private.task_flow_clean_steps('[{\"type\":\"client_request\",\"formCode\":\"title_vesting\",\"sendTo\":\"Client-Seller\",\"dueDays\":3}]')" 'is not filled in by the seller. Choose the buyer.' 'a form asked of the wrong party names who fills it in'
err "select private.task_flow_clean_steps('[{\"type\":\"client_request\",\"formCode\":\"nope\",\"sendTo\":\"Client-Buyer\",\"dueDays\":3}]')" 'choose which form to request' 'an unknown form is refused'
err "select private.task_flow_clean_steps('[{\"type\":\"client_request\",\"formCode\":\"personal_info\",\"sendTo\":\"Client-Buyer\",\"dueDays\":3,\"remindEvery\":2,\"remindTimes\":0}]')" 'say how many reminders' 'reminders on with no count is refused'
ok "$(val "select private.task_flow_clean_steps('[{\"type\":\"client_request\",\"formCode\":\"personal_info\",\"sendTo\":\"Client-Buyer\",\"dueDays\":\"3\",\"remindEvery\":0,\"remindTimes\":5}]') -> 0 ->> 'remindTimes'")" '0' 'no reminders clears the count'
ok "$(val "select private.task_flow_can_run('order_opened', '[{\"type\":\"client_request\"}]')")" '' 'a flow with only a request step can be turned on'

# a real run: buyer gets ONE email for both forms; the seller (no portal account) waits
q -c "insert into public.task_flows (id, name, trigger, active, steps, conditions, scope) values ('40000000-0000-0000-0000-000000000001', 'Intake requests', 'order_opened', true,
  private.task_flow_clean_steps('[{\"type\":\"client_request\",\"formCode\":\"personal_info\",\"sendTo\":\"Client-Buyer\",\"dueDays\":3,\"remindEvery\":2,\"remindTimes\":2},
    {\"type\":\"client_request\",\"formCode\":\"id_upload\",\"sendTo\":\"Client-Buyer\",\"dueDays\":3,\"remindEvery\":2,\"remindTimes\":2},
    {\"type\":\"client_request\",\"formCode\":\"hoa_info\",\"sendTo\":\"Client-Seller\",\"dueDays\":5}]'), '{\"transactionTypes\":[],\"states\":[],\"salesPeople\":[]}', 'all')" \
  -c "insert into public.task_flow_runs (id, flow_id, deal_id) values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '$D')"
ok "$(val "select private.task_flow_advance('50000000-0000-0000-0000-000000000001')")" '2' 'two new form tasks: the buyer''s ID and the seller''s HOA form (Personal information already existed)'
ok "$(val "select count(*) from public.tasks where template_code = 'personal_info'")" '1' 'the existing Personal information copy is used, not duplicated'
ok "$(val "select count(*) from public.outbox where template_key = 'client_request_digest'")" '1' 'one email, not one per form'
ok "$(val "select subject from public.outbox where template_key = 'client_request_digest'")" '2 items still needed for MD-26-90001' 'the email says how many items'
ok "$(val "select (body like '%- Personal information%' and body like '%- Upload identification%' and body like 'Hello Bea,%')::text from public.outbox")" 'true' 'the email lists both items'
ok "$(val "select to_profile_id || ' ' || sender_type from public.outbox")" '00000000-0000-0000-0000-00000000000b processor' 'it goes to the buyer, from the file''s processor'
ok "$(val "select count(*) from public.task_flow_runs r, jsonb_array_elements(r.log) l where l ->> 'text' like 'Sam Seller has no portal account yet%'")" '1' 'the run history says the seller''s email waits for their account'
ok "$(val "select private.task_flow_send_digests(null)")" '0' 'nothing more today'

# reminders: two days later, one reminder email listing what is still open
q -c "update public.task_flow_requests set next_at = now() - interval '1 minute' where remind_every > 0" -c "update public.outbox set created_at = now() - interval '2 days'"
ok "$(val "select private.task_flow_send_digests(null)")" '1' 'day 2: one reminder email'
ok "$(val "select subject from public.outbox order by created_at desc limit 1")" 'Reminder: 2 items still needed for MD-26-90001' 'the reminder lists both open items'
q -c "update public.tasks set status = 'done' where template_code = 'personal_info'" \
  -c "update public.task_flow_requests set next_at = now() - interval '1 minute' where next_at is not null" -c "update public.outbox set created_at = now() - interval '2 days'"
ok "$(val "select private.task_flow_send_digests(null)")" '1' 'day 4: one more reminder'
ok "$(val "select subject from public.outbox order by created_at desc limit 1")" 'Reminder: 1 item still needed for MD-26-90001' 'a submitted form comes off the list'
ok "$(val "select string_agg(t.template_code || ':' || q.sent || ':' || coalesce(q.next_at::text, 'none'), ',' order by t.template_code) from public.task_flow_requests q join public.tasks t on t.id = q.task_id where t.assigned_role = 'Client-Buyer'")" 'id_upload:3:none,personal_info:2:none' 'reminders stop after the set number, and once the form is submitted'
q -c "update public.task_flow_requests set next_at = now() - interval '1 minute', remind_times = 5 where sent = 3"
ok "$(val "select private.task_flow_send_digests(null)")" '0' 'never two reminder emails within 20 hours'

# the seller accepts their invite: the waiting request goes out
q -c "insert into public.profiles (id, first_name, last_name, email) values ('00000000-0000-0000-0000-00000000000c', 'Sam', 'Seller', 'sam@example.com')" \
  -c "update public.contacts set profile_id = '00000000-0000-0000-0000-00000000000c' where id = '10000000-0000-0000-0000-00000000000c'"
ok "$(val "select private.task_flow_send_digests(null)")" '1' 'the seller gets their request once they have an account'
ok "$(val "select subject from public.outbox where to_profile_id = '00000000-0000-0000-0000-00000000000c'")" '1 item still needed for MD-26-90001' 'it is a request, not a reminder'

# a test run makes the tasks but emails nobody
q -c "delete from public.tasks where template_code = 'hoa_info'" -c "insert into public.task_flow_runs (id, flow_id, deal_id, trial) values ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '$D', true)"
before=$(val "select count(*) from public.outbox")
ok "$(val "select private.task_flow_advance('50000000-0000-0000-0000-000000000002')")" '1' 'a test run makes the missing form task'
ok "$(val "select count(*) from public.outbox")" "$before" 'a test run queues no email'
ok "$(val "select (description like 'Test run. Requested by%')::text from public.tasks where template_code = 'hoa_info'")" 'true' 'its task is marked Test run'

# a switched-off form is not requested
q -c "insert into public.task_template_switches values ('hoa_info', false)" -c "delete from public.tasks where template_code = 'hoa_info'" \
  -c "insert into public.task_flow_runs (id, flow_id, deal_id, trial) values ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '$D', true)"
val "select private.task_flow_advance('50000000-0000-0000-0000-000000000003')" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs r, jsonb_array_elements(r.log) l where r.id = '50000000-0000-0000-0000-000000000003' and l ->> 'text' like '%form is switched off or retired%'")" '1' 'a switched-off form is not requested, and the history says why'
ok "$(val "select (private.run_task_flows() ? 'emails')::text")" 'true' 'the 15-minute check also sends the due reminders'

# rollback
q -f "$ROOT/supabase/rollbacks/20261126010000_task_flow_client_requests.sql" >/dev/null
ok "$(val "select coalesce(to_regclass('public.task_flow_requests')::text, 'gone')")" 'gone' 'rollback removes the reminder table'
ok "$(val "select count(*) from public.task_flows where steps @> '[{\"type\":\"client_request\"}]'")" '0' 'rollback takes request steps out of saved flows'
ok "$(val "select active::text from public.task_flows where id = '40000000-0000-0000-0000-000000000001'")" 'false' 'a flow left with no task step is turned off'
err "select private.task_flow_clean_steps('[{\"type\":\"client_request\"}]')" 'choose what the step does' 'after rollback the step type is unknown again'
exit $fail
