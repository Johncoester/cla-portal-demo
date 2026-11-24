#!/bin/sh
# OUTBOX-SEND-1 (John, Nov 24 2026, 11:06 AM ET): the outbox sender's database file. Backlog skipped, Test mode default,
# send_blocked, TC-only re-check, status changes, retries, no double claim, server key only. Disposable local database only (no hosted TEST).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=cla_outbox_$$
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
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema private; create schema extensions; create schema vault;
create extension pgcrypto schema extensions;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
insert into vault.secrets values ('gmail_sync_token', 'g');
create table public.profiles (id uuid primary key, email text);
create table public.deals (id uuid primary key);
create table public.email_sender_settings (sender_type text primary key, email text, display_name text);
insert into public.email_sender_settings values ('portal', 'portal@clatitle.com', 'CLA Title Portal'), ('hr', 'hr@clatitle.com', 'CLA Title HR');
create table public.outbox (id uuid primary key default gen_random_uuid(), channel text not null default 'email', status text not null default 'queued', sent_at timestamptz,
  to_profile_id uuid, to_email text not null, subject text not null, body text not null, task_id uuid, deal_id uuid, created_by uuid,
  created_at timestamptz not null default now(), to_name text not null default '', attachment_document_id uuid, title_package boolean not null default false, kind text not null default '',
  cc_emails text[] not null default '{}', bcc_emails text[] not null default '{}', attachment_document_ids uuid[] not null default '{}', from_email text, from_name text,
  sender_type text not null default 'other', sender_profile_id uuid, sender_fallback boolean not null default false, sender_fallback_reason text, post_closing_type text,
  template_key text not null default '', title_recipient_role text not null default '', send_blocked text not null default '',
  constraint outbox_status_check check (status = 'queued'), constraint outbox_sent_at_check check (sent_at is null));
grant select on public.outbox to authenticated;
-- TC-only stand-in: an address listed here is a TC-only agent (the real function is tested in test-tc-only-*-sql.sh)
create table private.tc_only_agents (email text primary key, name text);
create function private.resolve_recipients(p_deal uuid, p_profile uuid, p_email text)
returns table(action text, profile_id uuid, email text, first_name text, full_name text, agent_participant_ids uuid[], agent_first_name text, agent_name text, agent_side text)
language sql stable as $$
  select case when t.email is null then 'keep' else 'redirect' end, p_profile, lower(p_email), null::text, null::text, '{}'::uuid[], null::text, t.name, null::text
  from (select 1) one left join private.tc_only_agents t on t.email = lower(btrim(p_email)) and p_deal is not null $$;
insert into private.tc_only_agents values ('clatestportal+tconly@gmail.com', 'Pat Agent');
insert into public.deals values ('00000000-0000-0000-0000-0000000000d1');
-- the backlog: 3 old rows, one of them to a test address
insert into public.outbox (to_email, subject, body, created_at) values
  ('clatestportal+old1@gmail.com', 'old', 'b', now() - interval '3 days'), ('buyer@example.com', 'old', 'b', now() - interval '2 days'), ('clatestportal+old2@gmail.com', 'old', 'b', now() - interval '1 minute');
SQL

# --- the file applies once, refuses a second time and without the TEST Vault secret
q -f "$ROOT/supabase/migrations/20261131000000_outbox_sender.sql" >/dev/null
ok "$(val "select count(*) from public.outbox where status = 'skipped' and status_reason = 'pre-sender backlog, not sent' and sent_at is null")" "3" "all 3 old queued rows are skipped with the backlog reason"
ok "$(val "select mode from private.outbox_send_settings")" "test" "the switch starts in Test mode"
err "\\i $ROOT/supabase/migrations/20261131000000_outbox_sender.sql" "already exists" "a second run is refused"
ok "$(val "select has_function_privilege('authenticated', 'public.outbox_claim_batch(integer)', 'execute')::text || has_function_privilege('anon', 'public.outbox_mark_result(uuid,boolean,text,text,boolean)', 'execute')::text || has_function_privilege('service_role', 'public.outbox_claim_batch(integer)', 'execute')::text")" "falsefalsetrue" "only the server key can claim or mark"
ok "$(val "select has_table_privilege('authenticated', 'private.outbox_send_settings', 'select')::text || has_table_privilege('service_role', 'private.outbox_send_settings', 'update')::text || has_function_privilege('service_role', 'private.set_outbox_send_mode(text,text)', 'execute')::text")" "falsefalsefalse" "staff and the server key can not read or flip the switch"

# --- the old rows are never claimed, even if put back to queued
val "update public.outbox set status = 'queued', status_reason = '', processed_at = null where subject = 'old'" >/dev/null
ok "$(val "select jsonb_array_length(public.outbox_claim_batch(null)->'rows')")" "0" "an old row put back to queued is still never claimed (not_before)"
ok "$(val "select count(*) from public.outbox where subject = 'old' and status = 'queued'")" "3" "and the claim leaves it alone"

# --- new rows
q <<'SQL'
insert into public.outbox (to_email, subject, body, deal_id) values ('clatestportal+a@gmail.com', 'A', 'b', '00000000-0000-0000-0000-0000000000d1');
insert into public.outbox (to_email, subject, body) values ('buyer@example.com', 'REAL', 'b');
insert into public.outbox (to_email, cc_emails, subject, body) values ('clatestportal+b@gmail.com', '{agent@realty.com}', 'CCREAL', 'b');
insert into public.outbox (to_email, subject, body, send_blocked) values ('clatestportal+c@gmail.com', 'HELD', 'b', 'No TC is linked on the buyer side.');
insert into public.outbox (to_email, subject, body, deal_id) values ('clatestportal+tconly@gmail.com', 'TCONLY', 'b', '00000000-0000-0000-0000-0000000000d1');
insert into public.outbox (to_email, subject, body, deal_id, kind) values ('clatestportal+tconly@gmail.com', 'FEE', 'b', '00000000-0000-0000-0000-0000000000d1', 'agent_fee');
insert into public.outbox (to_email, bcc_emails, subject, body, deal_id) values ('clatestportal+d@gmail.com', '{clatestportal+tconly@gmail.com}', 'TCBCC', 'b', '00000000-0000-0000-0000-0000000000d1');
insert into public.outbox (to_email, subject, body, from_email, from_name) values ('clatestportal+e@gmail.com', 'PROC', 'b', 'pat.processor@clatitle.com', 'Pat Processor');
insert into public.outbox (to_email, subject, body, from_email) values ('clatestportal+f@gmail.com', 'ODDFROM', 'b', 'someone@gmail.com');
SQL
ok "$(val "select count(*) from public.outbox o, private.outbox_send_settings s where o.status = 'queued' and o.created_at >= s.not_before")" "9" "9 new rows are queued"
# off: nothing is claimed
val "update private.outbox_send_settings set mode = 'off'" >/dev/null
ok "$(val "select jsonb_array_length(public.outbox_claim_batch(null)->'rows')")" "0" "mode off: nothing is claimed"
ok "$(val "select count(*) from public.outbox where status <> 'queued' and subject <> 'old'")" "0" "mode off: no row changes"
val "update private.outbox_send_settings set mode = 'test'" >/dev/null

CLAIM=$(val "select public.outbox_claim_batch(null)")
ok "$(val "select string_agg(r->>'subject', ',' order by r->>'subject') from jsonb_array_elements('$CLAIM'::jsonb->'rows') r")" "A,FEE,ODDFROM,PROC" "Test mode claims only rows whose every address is a test address and no rule holds"
ok "$(val "select status || ' | ' || status_reason from public.outbox where subject = 'REAL'")" "skipped | Test mode: buyer@example.com is not a clatestportal+ test address, so nothing was sent." "Test mode: a real recipient is skipped with the reason"
ok "$(val "select status from public.outbox where subject = 'CCREAL'")" "skipped" "Test mode: a real cc is skipped too"
ok "$(val "select status || ' | ' || status_reason from public.outbox where subject = 'HELD'")" "blocked | Held by the portal: No TC is linked on the buyer side." "send_blocked -> blocked with the portal's reason"
ok "$(val "select status || ' | ' || left(status_reason, 14) from public.outbox where subject = 'TCONLY'")" "blocked | TC-only rule: " "a TC-only agent as the recipient -> blocked"
ok "$(val "select status from public.outbox where subject = 'TCBCC'")" "blocked" "a TC-only agent in bcc -> blocked"
ok "$(val "select status from public.outbox where subject = 'FEE'")" "sending" "TC-ONLY-3: a fee notice to the agent is still sent (their TC gets a copy)"
ok "$(val "select r->>'from' || ' / ' || (r->>'fromName') from jsonb_array_elements('$CLAIM'::jsonb->'rows') r where r->>'subject' = 'PROC'")" "pat.processor@clatitle.com / Pat Processor" "a processor's clatitle.com address is kept as From"
ok "$(val "select r->>'from' from jsonb_array_elements('$CLAIM'::jsonb->'rows') r where r->>'subject' = 'ODDFROM'")" "portal@clatitle.com" "a non-clatitle From falls back to portal@clatitle.com"
ok "$(val "select count(*) from public.outbox where status = 'sending' and attempts = 1 and claimed_at is not null")" "4" "claimed rows are 'sending', try 1"
ok "$(val "select jsonb_array_length(public.outbox_claim_batch(null)->'rows')")" "0" "a second claim takes nothing (no double send)"

# --- results
A=$(val "select id from public.outbox where subject = 'A'"); F=$(val "select id from public.outbox where subject = 'FEE'")
P=$(val "select id from public.outbox where subject = 'PROC'"); O=$(val "select id from public.outbox where subject = 'ODDFROM'")
ok "$(val "select public.outbox_mark_result('$A', true, 'ses-123', null, false)")" "sent" "success -> sent"
ok "$(val "select status || ' ' || (sent_at is not null)::text || ' ' || provider_message_id from public.outbox where id = '$A'")" "sent true ses-123" "sent row has sent_at and the service id"
ok "$(val "select public.outbox_mark_result('$A', false, null, 'late', true)")" "not sending" "a sent row can not be changed by a late result"
ok "$(val "select public.outbox_mark_result('$F', false, null, 'Amazon SES 400: Email address is not verified.', false)")" "failed" "refusal -> failed"
ok "$(val "select status || ' | ' || status_reason || ' | ' || (sent_at is null)::text from public.outbox where id = '$F'")" "failed | Amazon SES 400: Email address is not verified. | true" "failed row records the reason, no sent_at"
ok "$(val "select public.outbox_mark_result('$P', false, null, 'Amazon SES 503', true)")" "retry" "retryable -> back to queued"
ok "$(val "select status || ' ' || (next_attempt_at > now())::text || ' ' || left(status_reason, 24) from public.outbox where id = '$P'")" "queued true Try 1 failed: Amazon SES" "retry waits and says why"
ok "$(val "select jsonb_array_length(public.outbox_claim_batch(null)->'rows')")" "0" "a retry is not taken before its wait"
val "update public.outbox set attempts = 5, next_attempt_at = now() - interval '1 second' where id = '$P'" >/dev/null
ok "$(val "select jsonb_array_length(public.outbox_claim_batch(null)->'rows')")" "1" "after the wait it is taken again"
ok "$(val "select public.outbox_mark_result('$P', false, null, 'Amazon SES 503', true)")" "failed" "after the try limit it fails"
ok "$(val "select left(status_reason, 21) from public.outbox where id = '$P'")" "Gave up after 6 tries" "and says it gave up"
# stuck while sending: failed after 10 minutes, never retried
val "update public.outbox set claimed_at = now() - interval '11 minutes' where id = '$O'" >/dev/null
val "select public.outbox_claim_batch(null)" >/dev/null
ok "$(val "select status || ' ' || (status_reason like 'The sender stopped while sending%')::text from public.outbox where id = '$O'")" "failed true" "a row stuck in sending is failed, not resent"
# constraints
err "update public.outbox set status = 'sent' where id = '$F'" "outbox_sent_at_check" "sent needs sent_at"
err "update public.outbox set status = 'nonsense' where id = '$F'" "outbox_status_check" "unknown status refused"

# --- live mode: only the database owner, and only with the confirmation words
err "select private.set_outbox_send_mode('live')" "SEND REAL EMAIL" "live needs the confirmation words"
ok "$(val "select mode from private.outbox_send_settings")" "test" "still Test mode"
ok "$(val "select private.set_outbox_send_mode('live', 'SEND REAL EMAIL')")" "Portal email mode is now live" "the owner can turn on Live"
val "insert into public.outbox (to_email, subject, body) values ('buyer2@example.com', 'LIVE', 'b')" >/dev/null
ok "$(val "select string_agg(r->>'subject', ',') from jsonb_array_elements(public.outbox_claim_batch(null)->'rows') r")" "LIVE" "Live mode claims a real address"
ok "$(val "select private.set_outbox_send_mode('test')")" "Portal email mode is now test" "and back to Test"

# --- token check
ok "$(val "select public.outbox_svc_check_token('$(printf 'z%.0s' $(seq 1 40))')")" "f" "no Vault token: every caller is refused"
val "insert into vault.secrets values ('outbox_send_token', '$(printf 't%.0s' $(seq 1 40))')" >/dev/null
ok "$(val "select public.outbox_svc_check_token('$(printf 't%.0s' $(seq 1 40))')::text || public.outbox_svc_check_token('short')::text")" "truefalse" "the Vault token is accepted, a short one is not"

# --- rollback keeps the history and stops sending
q -f "$ROOT/supabase/rollbacks/20261131000000_outbox_sender.sql" >/dev/null
ok "$(val "select count(*) from public.outbox where status = 'sent'")" "1" "rollback keeps sent rows"
err "insert into public.outbox (to_email, subject, body, status) values ('x@y.z', 's', 'b', 'sent')" "outbox_status_check" "after rollback nothing new can be marked sent"
ok "$(val "select to_regprocedure('public.outbox_claim_batch(integer)') is null")" "t" "rollback removes the claim"

[ "$fail" = 0 ] && echo "outbox sender SQL passed" || { echo "outbox sender SQL failed"; exit 1; }
