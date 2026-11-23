#!/bin/sh
# TC-ONLY-3 (Francis Santos, Nov 23 2026): fee change and title commitment notices go to BOTH the agent and their TC; the greeting
# on an email moved or copied to a TC becomes "Hello <TC first name>". Disposable local database only (no hosted TEST).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_tc3_$$
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
q -f "$ROOT/supabase/migrations/20261129110000_tc_only_both_and_hello.sql"
echo "ok TC-ONLY-3 applies"
err "\\i $ROOT/supabase/migrations/20261129110000_tc_only_both_and_hello.sql" "drift: private." "a second apply stops at the pre-flight (bodies no longer the live TC-ONLY-1 ones)"
ok "$(val "select string_agg(proname || ':' || md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'private'::regnamespace and proname in ('comm_swap_greeting', 'trg_outbox_tc_only', 'trg_notifications_tc_only');")" "comm_swap_greeting:b122f14fc13a27836d6d509a8608c2f2,trg_notifications_tc_only:f002636532231c79b21c2f87affbc506,trg_outbox_tc_only:0065f664b234fe54090f1f2d9d907aca" "fingerprints match the ones the rollback checks"
# rollback puts the exact live bodies back, then the migration applies again
q -f "$ROOT/supabase/rollbacks/20261129110000_tc_only_both_and_hello.sql" >/dev/null
ok "$(val "select string_agg(md5(prosrc), ',' order by proname) from pg_proc where pronamespace = 'private'::regnamespace and proname in ('comm_swap_greeting', 'trg_outbox_tc_only', 'trg_notifications_tc_only');")" "949663ed564e0c7a9393f99804d1f5f6,fb9b5207b967b61f798f22bda47cb351,b1b29c42220e8366d2c74f4f58bdcc86" "rollback restores the TEST fingerprints exactly"
err "\\i $ROOT/supabase/rollbacks/20261129110000_tc_only_both_and_hello.sql" "is not the TC-ONLY-3 body" "a second rollback stops at its pre-flight"
q -f "$ROOT/supabase/migrations/20261129110000_tc_only_both_and_hello.sql" >/dev/null
echo "ok re-applies after the rollback"
# Sam is Pat's TC (buyer side), Kim is Lee's TC (listing side); both agents ticked
val "insert into public.deal_participants (deal_id, contact_id, role) values ('$D', '00000000-0000-0000-0000-0000000000c3', 'Buyer Agent TC'), ('$D', '00000000-0000-0000-0000-0000000000c5', 'Listing Agent TC');
  insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3'), ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c5');" >/dev/null
as $PROC "select public.set_participant_tc_only('$EPAT', true); select public.set_participant_tc_only('$ELEE', true);" >/dev/null
# (3) fee change email: the agent keeps it, the TC gets a copy greeted by name
val "insert into public.outbox (to_profile_id, to_email, to_name, subject, body, deal_id, kind, cc_emails) values ('$PAT', 'pat@agent.test', 'Pat Agent', 'Agent fees changed', 'Hi Pat,
Your fees changed.', '$D', 'agent_fee', array['proc@clatitle.com']);" >/dev/null
ok "$(val "select string_agg(to_email || '/' || split_part(body, E'\n', 1) || '/' || array_to_string(cc_emails, ';'), ',' order by to_email) from public.outbox where subject = 'Agent fees changed';")" "pat@agent.test/Hi Pat,/proc@clatitle.com,sam@tc.test/Hello Sam,/" "fee change email: the agent gets it as before and the TC gets their own copy (Hello Sam)"
ok "$(val "select action || ':' || array_to_string(to_emails, ',') from public.comm_redirect_log where detail = 'Copy to TC (the agent gets it too): Agent fees changed';")" "redirected:sam@tc.test" "the TC copy is logged"
# (3) title commitment email to the buyer agent: both
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, title_recipient_role, template_key) values ('$PAT', 'pat@agent.test', 'Title commitment - MD-26-90001', 'Title commitment only.', '$D', 'buyer_agent_commitment', 'buyer_agent_commitment');" >/dev/null
ok "$(val "select string_agg(to_email, ',' order by to_email) from public.outbox where subject = 'Title commitment - MD-26-90001';")" "pat@agent.test,sam@tc.test" "title commitment email: the buyer agent and their TC"
# (3) listing agent's title package (by email, no login needed): both
val "insert into public.outbox (to_email, to_name, subject, body, deal_id, title_package, title_recipient_role) values ('lee@agent.test', 'Lee Lister', 'Title package', 'Hello Lee, attached.', '$D', true, 'listing_agent');" >/dev/null
ok "$(val "select string_agg(to_email || '/' || body, ',' order by to_email) from public.outbox where subject = 'Title package';")" "kim@tc.test/Hello Kim, attached.,lee@agent.test/Hello Lee, attached." "listing agent's title package: the agent and their TC"
# everything else is still TC only, now greeted "Hello <TC>"
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$PAT', 'pat@agent.test', 'Closing moved', '<p>Dear Pat,</p><p>Patricia says hi.</p>', '$D');" >/dev/null
ok "$(val "select string_agg(to_email || '|' || body, ',') from public.outbox where subject = 'Closing moved';")" "sam@tc.test|<p>Hello Sam,</p><p>Patricia says hi.</p>" "other emails: TC only, greeting becomes Hello <TC first name>, nothing else changes"
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$LEE', 'lee@agent.test', 'Lee note', 'Hi Lee,
Thanks.', '$D');" >/dev/null
ok "$(val "select string_agg(to_email || '|' || split_part(body, E'\n', 1), ',') from public.outbox where subject = 'Lee note';")" "kim@tc.test|Hello Kim," "listing side the same"
# portal alerts: fee change to both, others to the TC only
as $PROC "select private.notify(array['$PAT'::uuid], 'agent_fee', '$D', 'Fees changed by Paula', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',' order by profile_id) from public.notifications where title = 'Fees changed by Paula';")" "$PAT,$SAM" "fee change alert: the agent and the TC"
as $PROC "select private.notify(array['$PAT'::uuid, '$SAM'::uuid], 'agent_fee', '$D', 'Fees changed again', '#/deals/x');" >/dev/null
ok "$(val "select count(*) filter (where profile_id = '$PAT') || ':' || count(*) filter (where profile_id = '$SAM') from public.notifications where title = 'Fees changed again';")" "1:1" "agent and TC both named: one each"
as $SAM "select private.notify(array['$PAT'::uuid, '$PROC'::uuid], 'agent_fee', '$D', 'Fees changed by Sam (TC)', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',' order by profile_id) from public.notifications where title = 'Fees changed by Sam (TC)';")" "$PROC,$PAT" "the TC's own change: the agent and processor get it, no copy back to the TC"
as $PROC "select private.notify(array['$PAT'::uuid], 'task', '$D', 'New task: B', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',') from public.notifications where title = 'New task: B';")" "$SAM" "other alerts: still the TC only"
# failure case: no linked TC on the listing side. A fee notice still reaches the agent; any other email is held.
val "delete from public.agent_tc_links where agent_contact_id = '00000000-0000-0000-0000-0000000000c4';" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, kind) values ('$LEE', 'lee@agent.test', 'Lee fees', 'Hi Lee', '$D', 'agent_fee');" >/dev/null
ok "$(val "select string_agg(to_email || ':' || send_blocked, ',') from public.outbox where subject = 'Lee fees';")" "lee@agent.test:" "no TC linked: the fee notice still goes to the agent, unblocked"
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id) values ('$LEE', 'lee@agent.test', 'Lee held', 'Hi Lee', '$D');" >/dev/null
ok "$(val "select (send_blocked <> '')::text from public.outbox where subject = 'Lee held';")" "true" "no TC linked: other email to the agent is held, as before"
# "both" kinds with no TC copy possible: the agent's copy goes out, nothing held, no processor alert, the skip is logged
ok "$(val "select count(*) from public.comm_redirect_log where action = 'held' and detail = 'TC copy skipped, the agent got it: Lee fees (no TC linked on that side)';")" "1" "no TC linked: the skipped TC copy is logged"
ok "$(val "select count(*) from public.notifications where kind = 'tc_only_held' and title like '%Lee fees%';")" "0" "no processor alert for it"
val "update public.contacts set email = '', profile_id = null where id = '00000000-0000-0000-0000-0000000000c3';" >/dev/null
val "insert into public.outbox (to_profile_id, to_email, subject, body, deal_id, kind) values ('$PAT', 'pat@agent.test', 'Pat fees no email', 'Hi Pat', '$D', 'agent_fee');" >/dev/null
ok "$(val "select string_agg(to_email || ':' || send_blocked, ',') from public.outbox where subject = 'Pat fees no email';")" "pat@agent.test:" "TC with no email: the agent gets the fee notice, not held"
ok "$(val "select count(*) from public.comm_redirect_log where detail = 'TC copy skipped, the agent got it: Pat fees no email (the TC has no email)';")" "1" "TC with no email: logged"
val "update public.contacts set email = 'sam@tc.test', profile_id = null where id = '00000000-0000-0000-0000-0000000000c3';" >/dev/null
as $PROC "select private.notify(array['$PAT'::uuid], 'agent_fee', '$D', 'Fees no login', '#/deals/x');" >/dev/null
ok "$(val "select string_agg(profile_id::text, ',') from public.notifications where title = 'Fees no login';")" "$PAT" "TC with no login: the agent gets the fee alert"
ok "$(val "select count(*) from public.comm_redirect_log where channel = 'in_app' and detail = 'TC copy skipped, the agent got it: Fees no login (the TC has no portal login)';")" "1" "TC with no login: logged"
val "update public.contacts set profile_id = '$SAM' where id = '00000000-0000-0000-0000-0000000000c3';" >/dev/null
# names with & or < in the greeting
ok "$(val "select private.comm_swap_greeting('Hi Pat,', 'Pat', 'A&B') || '|' || private.comm_swap_greeting('<p>Hi Pat,</p>', 'Pat', 'A&B <x>')")" "Hello A&B,|<p>Hello A&amp;B &lt;x&gt;,</p>" "a & in a TC first name is kept; HTML bodies get the name escaped"
# typed emails (gmail-send) keep the TC-only routing; the Hello wording is done in gmail-send (test-gmail-phase1.js)
ok "$(as $PROC "select (public.comm_route_emails('$D', array['pat@agent.test'], '{}', '{}') -> 'to')::text;")" '["sam@tc.test"]' "typed email: still to the TC"
# greeting function edge cases
ok "$(val "select private.comm_swap_greeting('Hi Patricia,', 'Pat', 'Sam') || '|' || private.comm_swap_greeting('Good morning Pat,', 'Pat', 'Sam') || '|' || private.comm_swap_greeting('Thanks Pat', 'Pat', 'Sam')")" "Hi Patricia,|Hello Sam,|Thanks Pat" "greeting: only the agent's name as a whole word, only after a greeting"

# drift: one function changed by someone else -> the migration stops and replaces nothing
q -f "$ROOT/supabase/rollbacks/20261129110000_tc_only_both_and_hello.sql" >/dev/null
val "create or replace function private.comm_swap_greeting(p_body text, p_old text, p_new text) returns text language sql immutable set search_path to pg_catalog as \$\$ select p_body \$\$;" >/dev/null
err "\\i $ROOT/supabase/migrations/20261129110000_tc_only_both_and_hello.sql" "drift: private.comm_swap_greeting is not the TC-ONLY-1 body" "a changed function stops the migration"
ok "$(val "select md5(prosrc) from pg_proc where pronamespace = 'private'::regnamespace and proname = 'trg_outbox_tc_only';")" "b1b29c42220e8366d2c74f4f58bdcc86" "nothing else was replaced"
[ "$fail" = 0 ] || exit 1
echo "tc-only-3 sql: all passed"
