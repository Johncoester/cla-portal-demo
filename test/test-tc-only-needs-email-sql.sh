#!/bin/sh
# TC-ONLY-2c (CRM Bot review of PR 415, Nov 23 2026): set_participant_tc_only refuses to tick the box when no TC linked to the agent on
# that side has an email. Disposable database only: the TC-ONLY-1 stand-in schema, 20261129030000, then 20261129050000, the checks, the rollback.
# Does not connect to the hosted TEST project and does not use its data.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_tc_only_email_$$
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
q -f "$ROOT/supabase/migrations/20261129050000_tc_only_needs_tc_email.sql"
echo "ok TC-ONLY-2c applies"
err "\\i $ROOT/supabase/migrations/20261129050000_tc_only_needs_tc_email.sql" "drift: already applied" "a second apply stops with a drift message"
ok "$(val "select has_function_privilege('anon', 'public.set_participant_tc_only(uuid, boolean)', 'execute')::text || has_function_privilege('authenticated', 'public.set_participant_tc_only(uuid, boolean)', 'execute')::text;")" "falsetrue" "anon still cannot run it; signed-in users can (the staff check is inside)"

# the same refusals as before
err "set test.uid = '$PAT'; select public.set_participant_tc_only('$EPAT', true);" "Only CLA staff on this file" "the agent cannot tick their own box"
err "set test.uid = '$PROC'; select public.set_participant_tc_only('$EPAT', true);" "has no TC on the buyer side" "no TC linked: the processor is told to add one first"

# Nora is linked to Pat on the buyer side but has no email (and no login)
val "update public.contacts set email = '' where id = '00000000-0000-0000-0000-0000000000c8';
  insert into public.deal_participants (id, deal_id, contact_id, role) values ('00000000-0000-0000-0000-0000000000e8', '$D', '00000000-0000-0000-0000-0000000000c8', 'Buyer Agent TC');
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c8');" >/dev/null
err "set test.uid = '$PROC'; select public.set_participant_tc_only('$EPAT', true);" "TC on the buyer side has no email address" "the only linked TC has no email: ticking is refused with a plain reason"
ok "$(val "select tc_only from public.deal_participants where id = '$EPAT';")" "f" "nothing was saved"
ok "$(val "select count(*) from public.activity_log where action = 'participant.tc_only';")" "0" "nothing logged for a refused tick"

# add Sam (email + login) as a second linked TC: ticking works and names only the TC with an email
val "insert into public.deal_participants (id, deal_id, contact_id, role) values ('00000000-0000-0000-0000-0000000000e3', '$D', '00000000-0000-0000-0000-0000000000c3', 'Buyer Agent TC');
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');" >/dev/null
ok "$(as $PROC "select public.set_participant_tc_only('$EPAT', true) ->> 'tcs';")" '["Sam Coordinator"]' "one TC with an email: ticking works and only that TC is named"
ok "$(val "select detail like '%go to Sam Coordinator.' from public.activity_log where action = 'participant.tc_only';")" "t" "the activity line names only the TC with an email"

# Sam leaves the file: ticked box can always be unticked, even with only the no-email TC left
val "delete from public.deal_participants where id = '00000000-0000-0000-0000-0000000000e3';" >/dev/null
ok "$(as $PROC "select (public.set_participant_tc_only('$EPAT', false) ->> 'tcOnly');")" "false" "unticking is always allowed"
err "set test.uid = '$ADA'; select public.set_participant_tc_only('$EPAT', true);" "has no email address" "an Admin gets the same refusal"

# a no-email contact whose login has an email counts (tc_only_targets uses the login email)
val "update public.contacts set email = '', profile_id = '$KIM' where id = '00000000-0000-0000-0000-0000000000c8';" >/dev/null
ok "$(as $PROC "select public.set_participant_tc_only('$EPAT', true) ->> 'tcOnly';")" "true" "a TC whose contact has no email but whose portal login does can stand in"
as $PROC "select public.set_participant_tc_only('$EPAT', false);" >/dev/null

# rollback: the TC-ONLY-1 version comes back (a linked TC with no email can be ticked again)
q -f "$ROOT/supabase/rollbacks/20261129050000_tc_only_needs_tc_email.sql"
val "update public.contacts set profile_id = null where id = '00000000-0000-0000-0000-0000000000c8';" >/dev/null
ok "$(as $PROC "select public.set_participant_tc_only('$EPAT', true) ->> 'tcOnly';")" "true" "rollback restores the old rule"
ok "$(val "select position('TC-ONLY-2c' in pg_get_functiondef('public.set_participant_tc_only(uuid, boolean)'::regprocedure));")" "0" "rollback removes the new body"
ok "$(val "select has_function_privilege('anon', 'public.set_participant_tc_only(uuid, boolean)', 'execute');")" "f" "rollback keeps anon out"
as $PROC "select public.set_participant_tc_only('$EPAT', false);" >/dev/null
q -f "$ROOT/supabase/migrations/20261129050000_tc_only_needs_tc_email.sql"
echo "ok applies again after the rollback"

[ "$fail" = 0 ] || exit 1
echo "tc-only needs-email sql: all passed"
