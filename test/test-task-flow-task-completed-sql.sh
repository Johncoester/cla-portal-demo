#!/bin/sh
# Task Builder TB-11, Nov 22 2026 (John): the "Task completed" trigger. Checking off a chosen task on a file starts the template and queues its
# email straight away (John: "if we received the EMD and we click EMD received, an automatic email should go out").
# Disposable database only: applies the Task Builder files and 20261129020000_task_flow_task_completed.sql on a small stand-in schema, then the rollback.
# schema, checks the rules, then the rollback. Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_task_flow_email_$$
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
create table public.outbox (id uuid primary key default gen_random_uuid(), to_profile_id uuid, to_email text not null, to_name text not null default '', subject text, body text,
  task_id uuid, deal_id uuid, created_by uuid, created_at timestamptz default now(), sender_type text, template_key text default '', kind text not null default '',
  title_package boolean not null default false, post_closing_type text,
  constraint outbox_recipient_check check ((to_profile_id is not null) or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0)
    or (post_closing_type is not null and char_length(to_email) > 3) or (kind = 'scheduling' and char_length(to_email) > 3 and char_length(to_name) > 0)));
create table public.email_templates (id uuid primary key default gen_random_uuid(), name text, subject text, body_html text, scope text default 'shared', active boolean default true);
insert into public.email_templates (id, name, subject, body_html) values ('60000000-0000-0000-0000-000000000001', 'Closing thank you', 'Thank you, {{buyer_first_name}}!',
  '<p>Hi {{recipient_first_name}},</p><p>Thank you for closing on {{property_address}} &amp; welcome home.</p><p>{{processor_line}}</p>');
create table public.notices (owners uuid[], title text);
create table public.deal_business_sources (deal_id uuid primary key, source text not null default '', set_by uuid, set_at timestamptz default now());
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function private.is_admin() returns boolean language sql stable as $$ select coalesce((select admin from public.profiles where id = private.effective_uid()), false) $$;
create function private.person_name(uuid) returns text language sql stable as $$ select first_name || ' ' || last_name from public.profiles where id = $1 $$;
create function private.view_as_readonly() returns trigger language plpgsql as $$ begin return coalesce(new, old); end $$;
create function private.notify(uuid[], text, uuid, text, text) returns void language sql as $$ insert into public.notices values ($1, $4) $$;
insert into public.profiles (id, first_name, last_name, admin, email) values ('00000000-0000-0000-0000-00000000000a', 'Adam', 'Admin', true, 'adam@cla.test'),
  ('00000000-0000-0000-0000-00000000000b', 'Bea', 'Buyer', false, 'bea@example.com');
insert into public.contacts (id, profile_id, first_name, last_name, email) values ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Bea', 'Buyer', 'bea@example.com'),
  ('10000000-0000-0000-0000-00000000000c', null, 'Sam', 'Seller', 'sam@example.com');
alter table public.deals add column zip text default '', add column purchase_price numeric, add column lender_name text default '';
insert into public.profiles (id, first_name, last_name, admin, email) values ('00000000-0000-0000-0000-0000000000ff', 'Pat', 'Processor', false, 'pat@cla.test');
insert into public.deals (id, file_number, street, city, state, zip, processor_id) values ('20000000-0000-0000-0000-000000000001', 'MD-26-90001', '1 Main St', 'Bowie', 'MD', '20715', '00000000-0000-0000-0000-0000000000ff');
insert into public.deal_participants (id, deal_id, contact_id, role) values ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000b', 'Client-Buyer'),
  ('30000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000c', 'Client-Seller');
insert into public.task_templates (code, version, title) values ('personal_info', 8, 'Personal information'), ('id_upload', 2, 'Upload identification'), ('hoa_info', 2, 'Confirm HOA Information');
-- the buyer already has an open Personal information copy (made when they were added): the request uses it
insert into public.tasks (deal_id, title, kind, participant_id, owner_profile_id, template_code, assigned_role, due_date)
  values ('20000000-0000-0000-0000-000000000001', 'Personal information', 'form', '30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'personal_info', 'Client-Buyer', current_date + 7);
SQL
for m in 20261120010000_task_builder_flows 20261121010000_task_flow_engine 20261122010000_task_flow_try_and_scope 20261126010000_task_flow_client_requests 20261127010000_task_flow_email_step 20261128010000_task_flow_non_referring_agents; do
  q -f "$ROOT/supabase/migrations/$m.sql" >/dev/null; done
D=20000000-0000-0000-0000-000000000001
A=00000000-0000-0000-0000-00000000000a


q -c "insert into public.task_templates (code, version, title) values ('emd_receipt', 1, 'EMD Receipt');" >/dev/null
q -f "$ROOT/supabase/migrations/20261129020000_task_flow_task_completed.sql" >/dev/null
v3() { val "set app.uid = '$A'; select public.save_task_flow_v3($1)" | tail -1; }
EMAIL='[{"type":"send_email","sendTo":"Client-Buyer","subject":"We received your EMD","body":"Hi {{recipient_first_name}}, we received your deposit for {{property_address}}."}]'

err "set app.uid = '$A'; select public.save_task_flow_v3(null, 'EMD thanks', '', 'task_completed', null, '', '', '{}', '$EMAIL')" 'Choose which task starts the template' 'Task completed with no task is refused'
err "set app.uid = '$A'; select public.save_task_flow_v3(null, 'EMD thanks', '', 'task_completed', null, 'tpl:nope', '', '{}', '$EMAIL')" 'from the list' 'a standard task that does not exist is refused'
F=$(v3 "null, 'EMD thanks', '', 'task_completed', null, 'tpl:emd_receipt', '', '{}', '$EMAIL'")
ok "$(val "select trigger || '|' || trigger_task || '|' || trigger_task_name || '|' || active from public.task_flows where id = '$F'")" 'task_completed|tpl:emd_receipt|EMD Receipt|false' 'it saves Off with the task and its name'
ok "$(val "select detail from public.task_flow_log where flow_id = '$F'")" 'Starts: Task completed: "EMD Receipt". Off. 1 step.' 'History names the task'
val "set app.uid = '$A'; select public.set_task_flow_active('$F', true)" >/dev/null
ok "$(val "select active from public.task_flows where id = '$F'")" 't' 'it can be turned on'

T=$(val "insert into public.tasks (deal_id, title, template_code, status) values ('$D', 'EMD Receipt', 'emd_receipt', 'todo') returning id" | tail -1)
before=$(val "select count(*) from public.outbox")
q -c "update public.tasks set status = 'in_progress' where id = '$T'" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs where flow_id = '$F'")" '0' 'a task that is only started does nothing'
q -c "update public.tasks set status = 'done' where id = '$T'" >/dev/null
ok "$(val "select count(*) - $before from public.outbox where kind = 'task_flow_email'")" '1' 'checking off EMD Receipt queues the email straight away'
ok "$(val "select to_email || '|' || subject from public.outbox where subject = 'We received your EMD'")" 'bea@example.com|We received your EMD' 'to the buyer, with the subject'
ok "$(val "select status from public.task_flow_runs where flow_id = '$F'")" 'done' 'the run finishes'
q -c "update public.tasks set status = 'todo' where id = '$T'; update public.tasks set status = 'done' where id = '$T';" >/dev/null
ok "$(val "select count(*) from public.outbox where subject = 'We received your EMD'")" '1' 'unchecking and checking again does not send it twice (once per file)'

# by name: a task a template makes, any case
F2=$(v3 "null, 'After the EMD chase', '', 'task_completed', null, 'title:Chase the EMD', 'Chase the EMD', '{}', '[{\"type\":\"create_task\",\"title\":\"Send EMD receipt\",\"assignTo\":\"Processor\",\"dueDays\":0}]'")
val "set app.uid = '$A'; select public.set_task_flow_active('$F2', true)" >/dev/null
T2=$(val "insert into public.tasks (deal_id, title, status) values ('$D', 'chase  the emd', 'todo') returning id" | tail -1)
q -c "update public.tasks set status = 'done' where id = '$T2'" >/dev/null
ok "$(val "select count(*) from public.tasks where deal_id = '$D' and title = 'Send EMD receipt'")" '1' 'a task matched by name (case and spacing do not count) starts its template, which makes the next task'
T3=$(val "insert into public.tasks (deal_id, title, description, status) values ('$D', 'Chase the EMD', 'Test run. from a template', 'todo') returning id" | tail -1)
q -c "delete from public.task_flow_runs where flow_id = '$F2'; update public.tasks set status = 'done' where id = '$T3'" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs where flow_id = '$F2'")" '0' 'a test-run task never starts anything'
q -c "update public.deals set status = 'Cancelled' where id = '$D'; update public.tasks set status = 'todo' where id = '$T2'; update public.tasks set status = 'done' where id = '$T2'; update public.deals set status = 'Closed' where id = '$D'" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs where flow_id = '$F2'")" '0' 'nothing starts on a file that is not open'

# a problem never stops the task from saving
q -c "update public.deals set status = 'Open' where id = '$D'; alter table public.task_flow_runs rename to task_flow_runs_x;" >/dev/null
T4=$(val "insert into public.tasks (deal_id, title, status) values ('$D', 'Chase the EMD', 'todo') returning id" | tail -1)
q -c "update public.tasks set status = 'done' where id = '$T4'" >/dev/null
ok "$(val "select status from public.tasks where id = '$T4'")" 'done' 'if the template engine fails, the task still saves'
ok "$(val "select count(*) > 0 from public.task_flow_errors")" 't' 'and the problem is written down'
q -c "alter table public.task_flow_runs_x rename to task_flow_runs;" >/dev/null

# changing the trigger forgets the task; the other save keeps working
val "set app.uid = '$A'; select public.set_task_flow_active('$F2', false)" >/dev/null
val "set app.uid = '$A'; select public.save_task_flow_v2('$F2', 'After the EMD chase', '', 'order_opened', null, '{}', '[{\"type\":\"create_task\",\"title\":\"Send EMD receipt\",\"assignTo\":\"Processor\",\"dueDays\":0}]')" >/dev/null
ok "$(val "select coalesce(trigger_task, 'none') from public.task_flows where id = '$F2'")" 'none' 'moving a template to another trigger clears its task'
F3=$(v3 "'$F', 'EMD thanks', '', 'task_completed', null, 'title:Chase the EMD', 'Chase the EMD', '{}', '$EMAIL'")
ok "$(val "select detail from public.task_flow_log where flow_id = '$F' order by id desc limit 1")" 'starts when "Chase the EMD" is checked off' 'changing which task shows in History'

# rollback
q -f "$ROOT/supabase/rollbacks/20261129020000_task_flow_task_completed.sql" >/dev/null
ok "$(val "select count(*) from public.task_flows where trigger = 'task_completed'")" '0' 'rollback removes Task completed templates'
ok "$(val "select count(*) from information_schema.columns where table_name = 'task_flows' and column_name like 'trigger_task%'")" '0' 'and the task columns'
ok "$(val "select count(*) from pg_trigger where tgname = 'zz_task_flow_task_events'")" '0' 'and the tasks trigger'
err "set app.uid = '$A'; select public.save_task_flow(null, 'Again', '', 'task_completed', null)" 'Choose what starts the flow' 'after rollback the trigger is refused again'
q -f "$ROOT/supabase/migrations/20261129020000_task_flow_task_completed.sql" >/dev/null
q -f "$ROOT/supabase/rollbacks/20261129020000_task_flow_task_completed.sql" >/dev/null
exit $fail
