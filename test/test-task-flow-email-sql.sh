#!/bin/sh
# Task Builder TB-7, Nov 20 2026 (John): "Send an email" steps and the "File closed" trigger (thank-you emails after closing).
# Disposable database only: applies TB-1, TB-2, the Nov 14 file, TB-6 and 20261127010000_task_flow_email_step.sql on a small stand-in
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
for m in 20261120010000_task_builder_flows 20261121010000_task_flow_engine 20261122010000_task_flow_try_and_scope 20261126010000_task_flow_client_requests 20261127010000_task_flow_email_step; do
  q -f "$ROOT/supabase/migrations/$m.sql" >/dev/null; done
D=20000000-0000-0000-0000-000000000001
A=00000000-0000-0000-0000-00000000000a

# checking a step
err "select private.task_flow_clean_steps('[{\"type\":\"send_email\",\"subject\":\"Hi\",\"body\":\"Thanks\"}]')" 'choose who the email goes to' 'no recipient is refused'
err "select private.task_flow_clean_steps('[{\"type\":\"send_email\",\"sendTo\":\"Client-Buyer\",\"subject\":\"Hi\",\"body\":\"Thanks\"}]')" 'give the email a subject' 'a too-short subject is refused'
err "select private.task_flow_clean_steps('[{\"type\":\"send_email\",\"sendTo\":\"Client-Buyer\",\"subject\":\"Thank you\",\"body\":\"Hi {{buyer_nickname}}\"}]')" '{{buyer_nickname}} is not a merge field' 'an unknown merge field is named'
ok "$(val "select private.task_flow_clean_steps('[{\"type\":\"send_email\",\"sendTo\":\"Client-Buyer\",\"templateId\":\"60000000-0000-0000-0000-000000000001\",\"templateName\":\"Closing thank you\",\"subject\":\"ignored\"}]') -> 0 ? 'subject'")" 'f' 'a template step keeps only the template'
ok "$(val "select private.task_flow_can_run('file_closed', '[{\"type\":\"send_email\"}]')")" '' 'a File closed flow with only an email step can be turned on'
err "select public.save_task_flow(null, 'x', '', 'file_closed', null)" 'Only an Admin' 'saving still needs an admin'

# File closed, wait 2 days, thank-you email (John's example)
q -c "insert into public.task_flows (id, name, trigger, active, scope, activated_at, steps, conditions) values ('40000000-0000-0000-0000-000000000001', 'Closing thank you', 'file_closed', true, 'new', now(),
  private.task_flow_clean_steps('[{\"type\":\"wait\",\"days\":2},{\"type\":\"send_email\",\"sendTo\":\"Client-Buyer\",\"subject\":\"Thank you, {{buyer_first_name}}\",\"body\":\"Hi {{recipient_first_name}},\\n\\nThank you so much for closing on {{property_address}}. Enjoy your new home!\\n\\n{{sender_name}}\"},
    {\"type\":\"send_email\",\"sendTo\":\"Client-Seller\",\"templateId\":\"60000000-0000-0000-0000-000000000001\",\"templateName\":\"Closing thank you\"}]'),
  '{\"transactionTypes\":[],\"states\":[],\"salesPeople\":[]}')"
q -c "update public.deals set status = 'Closed' where id = '$D'"
ok "$(val "select count(*) || ' ' || min(status) from public.task_flow_runs where flow_id = '40000000-0000-0000-0000-000000000001'")" '1 waiting' 'closing a file opened before the flow was turned on starts it'
ok "$(val "select private.task_flow_advance(id) from public.task_flow_runs where flow_id = '40000000-0000-0000-0000-000000000001'")" '0' 'it waits 2 days first'
ok "$(val "select count(*) from public.outbox")" '0' 'nothing is emailed before the wait is over'
q -c "update public.task_flow_runs set next_at = now() - interval '1 minute'"
val "select private.task_flow_advance(id) from public.task_flow_runs where flow_id = '40000000-0000-0000-0000-000000000001'" >/dev/null
ok "$(val "select status from public.task_flow_runs where flow_id = '40000000-0000-0000-0000-000000000001'")" 'done' 'the flow keeps running on its closed file and finishes'
ok "$(val "select count(*) from public.outbox where kind = 'task_flow_email'")" '2' 'one email to the buyer, one to the seller'
ok "$(val "select subject from public.outbox where to_email = 'bea@example.com'")" 'Thank you, Bea' 'the subject fills in the buyer''s first name'
ok "$(val "select body from public.outbox where to_email = 'bea@example.com'")" "$(printf 'Hi Bea,\n\nThank you so much for closing on 1 Main St, Bowie MD 20715. Enjoy your new home!\n\nPat Processor')" 'the message fills in the name, address and processor'
ok "$(val "select (to_profile_id is null)::text || ' ' || to_name || ' ' || sender_type from public.outbox where to_email = 'sam@example.com'")" 'true Sam Seller processor' 'a seller with no portal account still gets the email, from the processor'
ok "$(val "select body from public.outbox where to_email = 'sam@example.com'")" "$(printf 'Hi Sam,\n\nThank you for closing on 1 Main St, Bowie MD 20715 & welcome home.\n\nPat Processor (pat@cla.test)')" 'a saved template is filled in and sent as plain text'
ok "$(val "select subject from public.outbox where to_email = 'sam@example.com'")" 'Thank you, Bea!' 'a template subject fills in too'

# other flows still stop on a closed file
q -c "insert into public.task_flows (id, name, trigger, active, scope, steps, conditions) values ('40000000-0000-0000-0000-000000000002', 'Chase', 'closing_date_set', true, 'all',
  '[{\"type\":\"create_task\",\"title\":\"Chase\",\"assignTo\":\"Client-Buyer\",\"dueDays\":1}]', '{\"transactionTypes\":[],\"states\":[],\"salesPeople\":[]}')" \
  -c "insert into public.task_flow_runs (id, flow_id, deal_id) values ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000002', '$D')"
val "select private.task_flow_advance('50000000-0000-0000-0000-000000000009')" >/dev/null
ok "$(val "select status from public.task_flow_runs where id = '50000000-0000-0000-0000-000000000009'")" 'stopped' 'any other flow still stops when the file is no longer open'

# Try on one file: one test copy, only to the admin
before=$(val "select count(*) from public.outbox")
out=$(val "set app.uid = '$A'; select public.try_task_flow_on_file('40000000-0000-0000-0000-000000000001', '$D') ->> 'status'")
ok "$out" 'done' 'a File closed flow can be tried on a closed file'
ok "$(val "select count(*) - $before from public.outbox")" '2' 'two test copies (one per email step)'
ok "$(val "select count(*) from public.outbox where subject like '[Test] %' and to_email <> 'adam@cla.test'")" '0' 'test copies go only to the admin trying it'
ok "$(val "select (body like 'This is a test copy from Task Builder%On a real run this email goes to: Bea Buyer <bea@example.com>.%Hi Bea,%')::text from public.outbox where subject = '[Test] Thank you, Bea'")" 'true' 'the test copy says who the real email goes to, and shows the real names'
q -c "update public.deals set status = 'Cancelled' where id = '$D'"
err "set app.uid = '$A'; select public.try_task_flow_on_file('40000000-0000-0000-0000-000000000001', '$D')" 'cancelled or on hold' 'a cancelled file cannot be tried'

# a missing template and a party with no email
q -c "update public.deals set status = 'Closed' where id = '$D'" -c "update public.email_templates set active = false" -c "update public.contacts set email = '' where first_name = 'Bea'"
val "set app.uid = '$A'; select public.try_task_flow_on_file('40000000-0000-0000-0000-000000000001', '$D')" >/dev/null
ok "$(val "select count(*) from public.task_flow_runs r, jsonb_array_elements(r.log) l where r.trial and l ->> 'text' like 'The \"Closing thank you\" template was not found or is turned off%'")" '1' 'a turned-off template sends nothing and the history says why'
ok "$(val "select count(*) from public.task_flow_runs r, jsonb_array_elements(r.log) l where r.trial and l ->> 'text' like 'The buyer on this file has no email address%'")" '1' 'a party with no email is skipped and the history says why'

# non-referring agents (John, Nov 21): the intro email goes to the agents who did not refer the file
q <<'SQL' >/dev/null
insert into public.contacts (id, first_name, last_name, email) values ('10000000-0000-0000-0000-0000000000a1', 'Rita', 'Referrer', 'rita@agents.test'),
  ('10000000-0000-0000-0000-0000000000a2', 'Lou', 'Listing', 'lou@agents.test'), ('10000000-0000-0000-0000-0000000000a3', 'Ben', 'Buyerside', 'ben@agents.test');
insert into public.deals (id, file_number, street, city, state, zip, processor_id) values ('20000000-0000-0000-0000-0000000000a0', 'MD-26-90009', '9 Oak Rd', 'Laurel', 'MD', '20707', '00000000-0000-0000-0000-0000000000ff');
insert into public.deal_participants (deal_id, contact_id, role) values ('20000000-0000-0000-0000-0000000000a0', '10000000-0000-0000-0000-0000000000a1', 'Buyer Agent'),
  ('20000000-0000-0000-0000-0000000000a0', '10000000-0000-0000-0000-0000000000a2', 'Listing Agent'), ('20000000-0000-0000-0000-0000000000a0', '10000000-0000-0000-0000-00000000000b', 'Client-Buyer');
insert into public.deal_business_sources (deal_id, source) values ('20000000-0000-0000-0000-0000000000a0', 'buyer_agent:10000000-0000-0000-0000-0000000000a1');
SQL
N=20000000-0000-0000-0000-0000000000a0
R() { val "select string_agg(c.first_name, ',' order by c.first_name) from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = '$N' and private.task_flow_is_recipient(dp.deal_id, dp.role, dp.contact_id, 'non_referring_agents')"; }
ok "$(R)" 'Lou' 'the buyer agent who referred the file is left out; the listing agent gets the intro'
q -c "insert into public.deal_participants (deal_id, contact_id, role) values ('$N', '10000000-0000-0000-0000-0000000000a3', 'Buyer Agent');" >/dev/null
ok "$(R)" 'Ben,Lou' 'a second buyer agent who did not refer it gets it too'
q -c "update public.deal_business_sources set source = 'listing_agent' where deal_id = '$N';" >/dev/null
ok "$(R)" 'Ben,Rita' 'a listing-agent source with no person: every listing agent is the referrer'
q -c "update public.deal_business_sources set source = 'buyer' where deal_id = '$N';" >/dev/null
ok "$(R)" 'Ben,Lou,Rita' 'the buyer referred it: every agent gets the intro'
q -c "delete from public.deal_business_sources where deal_id = '$N';" >/dev/null
ok "$(R)" 'Ben,Lou,Rita' 'no source on the file: every agent gets it'
ok "$(val "select (private.task_flow_clean_steps('[{\"type\":\"send_email\",\"sendTo\":\"non_referring_agents\",\"subject\":\"Hello from CLA\",\"body\":\"Hi {{recipient_first_name}}\"}]') -> 0 ->> 'sendTo')")" 'non_referring_agents' 'an email step can go to the non-referring agents'
q -c "update public.deal_business_sources set source = 'buyer_agent:10000000-0000-0000-0000-0000000000a1' where deal_id = '$N';" >/dev/null 2>&1
q -c "insert into public.deal_business_sources (deal_id, source) values ('$N', 'buyer_agent:10000000-0000-0000-0000-0000000000a1') on conflict (deal_id) do update set source = excluded.source;" >/dev/null
FI=$(val "set app.uid = '$A'; select public.save_task_flow_v2(null, 'Owner intro', '', 'order_opened', null, '{}', '[{\"type\":\"send_email\",\"sendTo\":\"non_referring_agents\",\"subject\":\"Welcome from CLA Title\",\"body\":\"Hi {{recipient_first_name}}, I am John, the owner. Call me anytime.\"}]')" | tail -1)
before=$(val "select count(*) from public.outbox")
val "set app.uid = '$A'; select public.try_task_flow_on_file('$FI', '$N')" >/dev/null
ok "$(val "select count(*) - $before from public.outbox")" '1' 'Try on one file sends one test copy'
ok "$(val "select (body like '%Ben Buyerside <ben@agents.test>%' and body like '%Lou Listing <lou@agents.test>%' and body not like '%rita@%')::text from public.outbox where subject = '[Test] Welcome from CLA Title'")" 'true' 'the test copy lists the two non-referring agents, not the referrer'

# rollback
q -f "$ROOT/supabase/rollbacks/20261127010000_task_flow_email_step.sql" >/dev/null
ok "$(val "select count(*) from public.task_flows where steps @> '[{\"type\":\"send_email\"}]' or trigger = 'file_closed'")" '0' 'rollback takes email steps and File closed out of saved flows'
ok "$(val "select count(*) from public.outbox where to_profile_id is null")" '0' 'rollback removes queued flow emails the old outbox rule cannot hold'
err "select private.task_flow_clean_steps('[{\"type\":\"send_email\"}]')" 'choose what the step does' 'after rollback the step type is unknown again'
ok "$(val "select count(*) from information_schema.columns where table_name = 'task_flow_runs' and column_name = 'trial_to'")" '0' 'rollback drops trial_to'
exit $fail
