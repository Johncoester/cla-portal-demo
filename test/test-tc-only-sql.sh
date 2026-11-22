#!/bin/sh
# TC-ONLY-1 (John, Nov 22 2026): "Only communicate with TC" on a file's agent. Emails and portal alerts meant for that agent go to
# the TC linked to them on the same side; with no TC they are held (never sent to the agent) and the processor is alerted.
# Disposable database only: a small stand-in schema, then 20261129030000_tc_only_comm.sql, the checks, and the rollback.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_tc_only_$$
q() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
val() { sudo -u postgres psql -X -q -tA -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }
cleanup() { sudo -u postgres psql -X -q -d postgres -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
err() { out=$(sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c "$1" 2>&1 || true)
  case "$out" in *"$2"*) echo "ok $3";; *) echo "FAIL $3: $out"; fail=1;; esac; }
# run SQL as a signed-in person (the stand-in effective_uid reads test.uid)
as() { who=$1; shift; val "set test.uid = '$who'; $1"; }

sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema private; create schema extensions;
create table public.profiles (id uuid primary key, first_name text default '', last_name text default '', email text, status text default 'active', role text, is_admin boolean default false);
create table public.contacts (id uuid primary key, profile_id uuid, first_name text not null default '', last_name text not null default '', email text not null default '');
create table public.deals (id uuid primary key, file_number text, processor_id uuid);
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.deals(id), contact_id uuid not null, role text not null,
  created_at timestamptz not null default now());
create table public.agent_tc_links (id uuid primary key default gen_random_uuid(), agent_contact_id uuid not null, tc_contact_id uuid not null);
create table public.deal_business_sources (deal_id uuid primary key, source text);
create table public.activity_log (deal_id uuid, action text, detail text);
create table public.outbox (id uuid primary key default gen_random_uuid(), channel text not null default 'email', status text not null default 'queued', sent_at timestamptz,
  to_profile_id uuid references public.profiles(id), to_email text not null, subject text not null, body text not null, task_id uuid, deal_id uuid references public.deals(id), created_by uuid,
  created_at timestamptz not null default now(), to_name text not null default '', attachment_document_id uuid, title_package boolean not null default false, kind text not null default '',
  cc_emails text[] not null default '{}', bcc_emails text[] not null default '{}', attachment_document_ids uuid[] not null default '{}', from_email text, from_name text,
  sender_type text not null default 'other', sender_profile_id uuid, sender_fallback boolean not null default false, sender_fallback_reason text, post_closing_type text,
  template_key text not null default '', title_recipient_role text not null default '', send_blocked text not null default '',
  constraint outbox_recipient_check check ((to_profile_id is not null) or (title_package and char_length(to_email) > 3 and char_length(to_name) > 0)
    or (post_closing_type is not null and char_length(to_email) > 3) or (kind = 'scheduling' and char_length(to_email) > 3 and char_length(to_name) > 0)
    or (kind = 'task_flow_email' and char_length(to_email) > 3 and char_length(to_name) > 0)));
create table public.notifications (id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id), kind text not null, deal_id uuid,
  title text not null, link text not null default '', created_at timestamptz not null default now(), read_at timestamptz);
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function private.me_role() returns text language sql stable as $$ select role from public.profiles where id = private.effective_uid() and status = 'active' $$;
create function private.is_admin() returns boolean language sql stable as $$ select coalesce((select is_admin from public.profiles where id = private.effective_uid()), false) $$;
create function private.is_manager() returns boolean language sql stable as $$ select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Transaction Coordinator'), false) or private.is_admin() $$;
create function private.is_staffish() returns boolean language sql stable as $$ select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'), false) $$;
create function private.can_access_deal(d uuid) returns boolean language sql stable as $$
  select private.is_admin() or coalesce(private.me_role() in ('Processor', 'Transaction Coordinator'), false)
    or exists (select 1 from public.deal_participants p join public.contacts c on c.id = p.contact_id where p.deal_id = d and c.profile_id = private.effective_uid()) $$;
create function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void language sql as $$
  insert into public.activity_log values (p_deal, p_action, p_detail) $$;
create function private.notify(p_ids uuid[], p_kind text, p_deal uuid, p_title text, p_link text) returns void language sql as $$
  insert into public.notifications (profile_id, kind, deal_id, title, link)
  select distinct x, p_kind, p_deal, left(p_title, 200), coalesce(p_link, '') from unnest(p_ids) x join public.profiles p on p.id = x and p.status = 'active'
  where x is distinct from private.effective_uid() $$;
-- people: processor, buyer's agent Pat (TC-only), her TC Sam (login), listing agent Lee, a second TC Kim (login), TC Nora (no login), buyer Bo, outsider Oz
insert into public.profiles (id, first_name, last_name, email, role, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'Paula', 'Processor', 'proc@clatitle.com', 'Processor', false),
  ('00000000-0000-0000-0000-0000000000a2', 'Pat', 'Agent', 'pat@agent.test', 'Outside user', false),
  ('00000000-0000-0000-0000-0000000000a3', 'Sam', 'Coordinator', 'sam@tc.test', 'Outside user', false),
  ('00000000-0000-0000-0000-0000000000a4', 'Lee', 'Lister', 'lee@agent.test', 'Outside user', false),
  ('00000000-0000-0000-0000-0000000000a5', 'Kim', 'Second', 'kim@tc.test', 'Outside user', false),
  ('00000000-0000-0000-0000-0000000000a6', 'Bo', 'Buyer', 'bo@buyer.test', 'Outside user', false),
  ('00000000-0000-0000-0000-0000000000a7', 'Ada', 'Admin', 'ada@clatitle.com', 'Admin', true);
insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Pat', 'Agent', 'Pat@Agent.test'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Sam', 'Coordinator', 'sam@tc.test'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Lee', 'Lister', 'lee@agent.test'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Kim', 'Second', 'kim@tc.test'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000a6', 'Bo', 'Buyer', 'bo@buyer.test'),
  ('00000000-0000-0000-0000-0000000000c8', null, 'Nora', 'NoLogin', 'nora@tc.test');
insert into public.deals values ('00000000-0000-0000-0000-0000000000d1', 'MD-26-90001', '00000000-0000-0000-0000-0000000000a1');
insert into public.deal_participants (id, deal_id, contact_id, role) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', 'Buyer Agent'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c4', 'Listing Agent'),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c6', 'Client-Buyer');
SQL
# the Task Builder recipient rule exactly as TEST has it (the migration checks its body)
sed -n '/^create or replace function private.task_flow_is_recipient/,/^end \$\$;/p' "$ROOT/supabase/migrations/20261128010000_task_flow_non_referring_agents.sql" | q

D=00000000-0000-0000-0000-0000000000d1; PROC=00000000-0000-0000-0000-0000000000a1; PAT=00000000-0000-0000-0000-0000000000a2; SAM=00000000-0000-0000-0000-0000000000a3
LEE=00000000-0000-0000-0000-0000000000a4; KIM=00000000-0000-0000-0000-0000000000a5; BO=00000000-0000-0000-0000-0000000000a6; ADA=00000000-0000-0000-0000-0000000000a7
EPAT=00000000-0000-0000-0000-0000000000e2; ELEE=00000000-0000-0000-0000-0000000000e4

q -f "$ROOT/supabase/migrations/20261129030000_tc_only_comm.sql"
echo "ok migration applies"
err "\\i $ROOT/supabase/migrations/20261129030000_tc_only_comm.sql" "drift: deal_participants.tc_only already exists" "a second apply stops with a drift message"

# nothing ticked: agents get their email as before, nothing logged
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Before', 'Hi Pat, before', '$D');" >/dev/null
ok "$(val "select count(*) from public.outbox where subject = 'Before' and to_profile_id = '$PAT';")" "1" "no box ticked: the agent gets the email"
ok "$(val "select count(*) from public.comm_redirect_log;")" "0" "no box ticked: nothing logged"

# who can tick it
err "set test.uid = '$PAT'; select public.set_participant_tc_only('$EPAT', true);" "Only CLA staff on this file" "the agent cannot tick their own box"
err "set test.uid = '$BO'; select public.set_participant_tc_only('$EPAT', true);" "Only CLA staff on this file" "a buyer cannot tick it"
err "set test.uid = '$PROC'; select public.set_participant_tc_only('$EPAT', true);" "has no TC on the buyer side" "no TC linked: the processor is told to add one first"
err "set test.uid = '$PROC'; select public.set_participant_tc_only('00000000-0000-0000-0000-0000000000e6', true);" "Pick the buyer's agent or listing agent" "only an agent row has the box"
# Sam is Pat's TC on the buyer side; Kim is on the file as a buyer-side TC but linked to nobody
val "insert into public.deal_participants (id, deal_id, contact_id, role) values ('00000000-0000-0000-0000-0000000000e3', '$D', '00000000-0000-0000-0000-0000000000c3', 'Buyer Agent TC'),
  ('00000000-0000-0000-0000-0000000000e5', '$D', '00000000-0000-0000-0000-0000000000c5', 'Buyer Agent TC');
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');" >/dev/null
ok "$(as $PROC "select public.set_participant_tc_only('$EPAT', true) ->> 'tcs';")" '["Sam Coordinator"]' "processor ticks it; the TC named is the linked one on that side (not the unlinked TC)"
ok "$(val "select tc_only from public.deal_participants where id = '$EPAT';")" "t" "box saved"
ok "$(val "select count(*) from public.activity_log where action = 'participant.tc_only';")" "1" "ticking is in the file's activity"
ok "$(as $PROC "select string_agg(role || ':' || tc_only || ':' || jsonb_array_length(tcs), ',') from public.tc_only_status('$D');")" "Buyer Agent:true:1,Listing Agent:false:0" "Contacts status: buyer's agent ticked with 1 TC, listing agent not"
err "set test.uid = '$PAT'; select * from public.tc_only_status('$D');" "not allowed" "an agent cannot read the status list"

# queued email to the agent -> to the TC, greeting swapped, logged
val "insert into public.outbox (to_profile_id, to_email, to_name, subject, body, deal_id, kind) values ('$PAT', 'pat@agent.test', 'Pat Agent', 'Fees', 'Hi Pat,
Your fees changed.', '$D', 'agent_fee');" >/dev/null
ok "$(val "select to_profile_id || '|' || to_email || '|' || to_name || '|' || split_part(body, E'\n', 1) from public.outbox where subject = 'Fees';")" "$SAM|sam@tc.test|Sam Coordinator|Hi Sam," "email to the agent goes to the TC, greeting uses the TC's name"
ok "$(val "select count(*) from public.outbox where subject = 'Fees' and to_profile_id = '$PAT';")" "0" "nothing queued to the agent"
ok "$(val "select action || ':' || channel || ':' || agent_email || ':' || array_to_string(to_emails, ',') from public.comm_redirect_log where detail = 'Fees';")" "redirected:email:pat@agent.test:sam@tc.test" "the swap is logged"
# by email only (Task Builder email to a party), HTML greeting
val "insert into public.outbox (to_email, to_name, subject, body, deal_id, kind) values ('PAT@agent.test', 'Pat Agent', 'Intro', '<p>Hi Pat,</p><p>Patricia says hello.</p>', '$D', 'task_flow_email');" >/dev/null
ok "$(val "select to_email || '|' || body from public.outbox where subject = 'Intro';")" "sam@tc.test|<p>Hi Sam,</p><p>Patricia says hello.</p>" "matched by email (any case); only the greeting name changes"
# copies
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, cc_emails) values ('$BO', 'bo@buyer.test', 'Copy', 'Hello Bo', '$D', array['pat@agent.test', 'lee@agent.test']);" >/dev/null
ok "$(val "select to_email || '|' || array_to_string(cc_emails, ',') from public.outbox where subject = 'Copy';")" "bo@buyer.test|lee@agent.test,sam@tc.test" "a TC-only agent on cc is swapped for the TC; others unchanged"
# the listing agent is not ticked
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$LEE', 'lee@agent.test', 'Listing', 'Hi Lee', '$D');" >/dev/null
ok "$(val "select to_email from public.outbox where subject = 'Listing';")" "lee@agent.test" "the other side's agent (not ticked) still gets their email"
# the same task reminder twice in a day goes once
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, task_id) values ('$PAT', 'pat@agent.test', 'Reminder: X', 'Hello Pat', '$D', '00000000-0000-0000-0000-0000000000f1');" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, task_id) values ('$PAT', 'pat@agent.test', 'Reminder: X', 'Hello Pat', '$D', '00000000-0000-0000-0000-0000000000f1');" >/dev/null
ok "$(val "select count(*) || ':' || min(to_email) from public.outbox where subject = 'Reminder: X';")" "1:sam@tc.test" "a task reminder already queued to the TC today is not queued twice"

# in-app alerts
as $PROC "select private.notify(array['$PAT'::uuid], 'task', '$D', 'New task: A', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',') from public.notifications where title = 'New task: A';")" "$SAM" "an alert to the agent goes to the TC's login"
as $PROC "select private.notify(array['$PAT'::uuid, '$SAM'::uuid, '$BO'::uuid], 'closing', '$D', 'Closing moved', '#/deals/x');" >/dev/null
ok "$(val "select count(*) filter (where profile_id = '$SAM') || ':' || count(*) filter (where profile_id = '$PAT') || ':' || count(*) filter (where profile_id = '$BO') from public.notifications where title = 'Closing moved';")" "1:0:1" "agent + TC + buyer: the TC gets it once, the agent never, the buyer as before"
as $SAM "select private.notify(array['$PAT'::uuid, '$PROC'::uuid], 'agent_fee', '$D', 'Fees changed by Sam (TC)', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',') from public.notifications where title = 'Fees changed by Sam (TC)';")" "$PROC" "the TC's own change: no alert back to the TC, nothing held"

# gmail-send routing
ok "$(as $PROC "select public.comm_route_emails('$D', array['Pat@agent.test', 'bo@buyer.test'], array['lee@agent.test'], '{}', true)::text;")" \
  '{"cc": ["lee@agent.test"], "to": ["sam@tc.test", "bo@buyer.test"], "bcc": [], "held": [], "redirected": [{"to": ["sam@tc.test"], "from": "pat@agent.test", "list": "to", "side": "buyer'"'"'s agent", "toNames": ["Sam Coordinator"], "fromName": "Pat Agent", "toFirstName": "Sam", "fromFirstName": "Pat"}]}' \
  "typed email: the agent's address is swapped for the TC; others kept"
ok "$(val "select count(*) from public.comm_redirect_log where channel = 'gmail' and action = 'redirected';")" "1" "typed-email swap logged"
ok "$(as $PROC "select (public.comm_route_emails('$D', array['pat@agent.test', 'sam@tc.test'], '{}', '{}') -> 'to')::text;")" '["sam@tc.test"]' "agent and TC both typed: the TC once"
err "set test.uid = '$BO'; select public.comm_route_emails('$D', array['pat@agent.test'], '{}', '{}');" "You cannot email from this file" "only CLA staff can route a file email"

# two TCs linked: both get it
val "insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c5');" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Both', 'Hi Pat', '$D');" >/dev/null
ok "$(val "select string_agg(to_email || '/' || body, ',' order by to_email) from public.outbox where subject = 'Both';")" "kim@tc.test/Hi Kim,sam@tc.test/Hi Sam" "two linked TCs: one email each, each greeted by name"

# TC with no portal login: fine for a Task Builder email, held for an email that needs a login
val "delete from public.agent_tc_links where tc_contact_id in ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c5');
  insert into public.deal_participants (deal_id, contact_id, role) values ('$D', '00000000-0000-0000-0000-0000000000c8', 'Buyer Agent TC');
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c8');" >/dev/null
val "insert into public.outbox (to_email, to_name, subject, body, deal_id, kind) values ('pat@agent.test', 'Pat Agent', 'TB no login', 'Hi Pat', '$D', 'task_flow_email');" >/dev/null
ok "$(val "select coalesce(to_profile_id::text, 'none') || '|' || to_email || '|' || send_blocked from public.outbox where subject = 'TB no login';")" "none|nora@tc.test|" "Task Builder email reaches a TC with no login by email"
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Needs login', 'Hi Pat', '$D');" >/dev/null
ok "$(val "select (to_profile_id = '$PAT') || '|' || (send_blocked like 'Held on MD-26-90001: an email for Pat Agent (buyer''s agent, Only communicate with TC). Their TC has no portal login%') from public.outbox where subject = 'Needs login';")" "true|true" "an email that needs a login is held (never sent to the agent) when the TC has none"

# no TC at all: held + processor alerted + logged
val "delete from public.deal_participants where role = 'Buyer Agent TC';" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Held mail', 'Hi Pat', '$D');" >/dev/null
ok "$(val "select (send_blocked like 'Held on MD-26-90001: an email for Pat Agent (buyer''s agent, Only communicate with TC). No TC is linked%') from public.outbox where subject = 'Held mail';")" "t" "no TC: the email is held with a plain reason"
ok "$(val "select count(*) from public.notifications where profile_id = '$PROC' and kind = 'tc_only_held' and link like '%/contacts';")" "2" "the processor is alerted (the no-login hold above, and this one)"
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Held mail 2', 'Hi Pat', '$D');" >/dev/null
ok "$(val "select count(*) from public.notifications where profile_id = '$PROC' and kind = 'tc_only_held';")" "2" "a second hold for the same reason within the hour does not alert again"
as $PROC "select private.notify(array['$PAT'::uuid], 'task', '$D', 'New task: B', '#/deals/x');" >/dev/null
ok "$(val "select count(*) from public.notifications where title = 'New task: B';")" "0" "no TC: the alert is not given to the agent"
ok "$(val "select count(*) from public.notifications where profile_id = '$PROC' and kind = 'tc_only_held';")" "3" "the processor hears about the held alert too"
ok "$(val "select count(*) filter (where action = 'held') from public.comm_redirect_log;")" "4" "every hold is logged (3 emails, 1 alert)"
ok "$(as $PROC "select (public.comm_route_emails('$D', array['pat@agent.test'], '{}', '{}') -> 'held' -> 0 ->> 'email');")" "pat@agent.test" "typed email to a TC-only agent with no TC is refused"

# Task Builder: "Transaction coordinator" also means the agents' TCs
ok "$(val "select private.task_flow_is_recipient('$D', 'Buyer Agent TC', null, 'Transaction Coordinator') and private.task_flow_is_recipient('$D', 'Listing Agent TC', null, 'Transaction Coordinator')
  and private.task_flow_is_recipient('$D', 'Transaction Coordinator', null, 'Transaction Coordinator') and not private.task_flow_is_recipient('$D', 'Buyer Agent', null, 'Transaction Coordinator')
  and private.task_flow_is_recipient('$D', 'Buyer Agent', null, 'Buyer Agent');")" "t" "Task Builder TC choice reaches Buyer Agent TC / Listing Agent TC; other choices unchanged"

# untick: the agent gets email again
as $ADA "select public.set_participant_tc_only('$EPAT', false);" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'After', 'Hi Pat', '$D');" >/dev/null
ok "$(val "select to_email || '|' || send_blocked from public.outbox where subject = 'After';")" "pat@agent.test|" "unticked: the agent gets the email again"
err "set role authenticated; insert into public.comm_redirect_log (deal_id, channel, action) values ('$D', 'email', 'held');" "permission denied" "nobody signed in can write the audit log directly"

# rollback
q -f "$ROOT/supabase/rollbacks/20261129030000_tc_only_comm.sql"
ok "$(val "select count(*) from information_schema.columns where table_name = 'deal_participants' and column_name = 'tc_only';")" "0" "rollback removes the box"
ok "$(val "select private.task_flow_is_recipient('$D', 'Buyer Agent TC', null, 'Transaction Coordinator');")" "f" "rollback restores the old Task Builder rule"
q -f "$ROOT/supabase/migrations/20261129030000_tc_only_comm.sql"
echo "ok applies again after the rollback"

[ "$fail" = 0 ] || exit 1
echo "tc-only sql: all passed"
