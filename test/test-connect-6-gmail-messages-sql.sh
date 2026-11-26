#!/bin/bash
# CONNECT-6 rule 27 follow-up: list_deal_emails must hide a real file from a demo staff
# login, and must hide sent_by, mailbox_profile_id and template_key from non-staff.
# Disposable local Postgres only. Does not connect to TEST and does not use its data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/cla-connect6-XXXXXX")"
PORT=$(( 56000 + RANDOM % 4000 ))
cleanup() { "$BIN/pg_ctl" -D "$DATA/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$DATA/db" --username=postgres --auth=trust --no-instructions >/dev/null
"$BIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { psql -X -q -tA -v ON_ERROR_STOP=1 -c "$1"; }
fail=0
ok() { if [ "$1" = "$2" ]; then echo "ok $3"; else echo "FAIL $3 (got '$1', want '$2')"; fail=1; fi; }
as_val() { local uid="$1"; shift; psql -X -q -tA -v ON_ERROR_STOP=1 -c "set app.uid = '$uid'; set role authenticated; $*"; }

RA=10000000-0000-0000-0000-000000000001
DA=10000000-0000-0000-0000-000000000002
BY=10000000-0000-0000-0000-000000000003
RD=20000000-0000-0000-0000-000000000001
DD=20000000-0000-0000-0000-000000000002
RE=30000000-0000-0000-0000-000000000001
DE=30000000-0000-0000-0000-000000000002

q <<SQL
create schema private;
create schema extensions;
create role authenticated nologin;
create role anon nologin;
grant usage on schema public, private, extensions to authenticated, anon;

create table public.profiles (
  id uuid primary key,
  email text,
  role text,
  is_admin boolean not null default false,
  is_demo boolean not null default false
);
create table public.deals (
  id uuid primary key,
  file_number text,
  is_demo boolean not null default false
);
create table public.deal_emails (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  mailbox_profile_id uuid,
  mailbox_email text not null,
  direction text not null,
  gmail_message_id text not null,
  gmail_thread_id text not null,
  rfc_message_id text,
  from_email text not null default '',
  from_name text not null default '',
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text not null default '',
  body_html text not null default '',
  snippet text not null default '',
  sent_at timestamptz not null default now(),
  attachment_document_ids uuid[] not null default '{}',
  attachment_names text[] not null default '{}',
  template_key text,
  sent_by uuid,
  created_at timestamptz not null default now()
);

create function private.effective_uid() returns uuid
language sql stable as \$\$ select nullif(current_setting('app.uid', true), '')::uuid \$\$;
create function private.viewer_is_demo() returns boolean
language sql stable security definer set search_path = pg_catalog, public as \$\$
  select coalesce((select is_demo from public.profiles where id = private.effective_uid()), false)
\$\$;
create function private.is_staffish() returns boolean
language sql stable security definer set search_path = pg_catalog, public as \$\$
  select exists (
    select 1 from public.profiles p
    where p.id = private.effective_uid()
      and (p.is_admin or p.role in ('Admin', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator'))
  )
\$\$;
-- Matches TEST: staff can_access_deal is true for any deal id, with no is_demo check.
create function private.can_access_deal(p_deal uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as \$\$
  select exists (
    select 1 from public.profiles p
    where p.id = private.effective_uid()
      and (
        p.is_admin
        or p.role in ('Admin', 'Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Transaction Coordinator')
        or p.role = 'Outside user'
      )
  )
\$\$;
grant execute on all functions in schema private to authenticated;

insert into public.profiles (id, email, role, is_admin, is_demo) values
  ('$RA', 'real-admin@example.com', 'Admin', true, false),
  ('$DA', 'demo-admin@example.com', 'Admin', true, true),
  ('$BY', 'buyer@example.com', 'Outside user', false, false);
insert into public.deals (id, file_number, is_demo) values
  ('$RD', 'MD-26-REAL01', false),
  ('$DD', 'MD-26-DEMO01', true);
insert into public.deal_emails (
  id, deal_id, mailbox_profile_id, mailbox_email, direction,
  gmail_message_id, gmail_thread_id, from_email, from_name, to_emails, bcc_emails,
  subject, snippet, sent_at, template_key, sent_by
) values
  ('$RE', '$RD', '$RA', 'real-admin@example.com', 'out',
   'gm-real', 'thr-real', 'real-admin@example.com', 'Real Admin', ARRAY['buyer@example.com'], ARRAY['hidden@example.com'],
   'Real file intro', 'Hello real', '2026-11-25T15:00:00Z', 'intro', '$RA'),
  ('$DE', '$DD', '$DA', 'demo-admin@example.com', 'out',
   'gm-demo', 'thr-demo', 'demo-admin@example.com', 'Demo Admin', ARRAY['demo-buyer@example.com'], ARRAY['demo-hidden@example.com'],
   'Demo file intro', 'Hello demo', '2026-11-25T16:00:00Z', 'intro-demo', '$DA');
SQL

q -f "$ROOT/supabase/migrations/20261131270000_connect_6_gmail_messages.sql" >/dev/null

ok "$(as_val "$DA" "select count(*) from public.list_deal_emails('$RD')")" "0" 'a demo admin gets 0 emails on a real file'
ok "$(as_val "$RA" "select count(*) from public.list_deal_emails('$RD')")" "1" 'a non-demo admin still sees emails on a real file'
ok "$(as_val "$DA" "select count(*) from public.list_deal_emails('$DD')")" "1" 'a demo admin still sees emails on a demo file'
ok "$(as_val "$RA" "select count(*) from public.list_deal_emails('$DD')")" "0" 'a non-demo admin gets 0 emails on a demo file'
ok "$(as_val "$RA" "select mailbox_profile_id::text || ',' || sent_by::text || ',' || template_key || ',' || array_to_string(bcc_emails, ';') from public.list_deal_emails('$RD')")" "$RA,$RA,intro,hidden@example.com" 'staff still receive mailbox_profile_id, sent_by, template_key, and bcc'
ok "$(as_val "$BY" "select count(*) from public.list_deal_emails('$RD')")" "1" 'a party on a real file still sees mail they are on'
ok "$(as_val "$BY" "select coalesce(mailbox_profile_id::text,'') || ',' || coalesce(sent_by::text,'') || ',' || coalesce(template_key,'') || ',' || array_to_string(bcc_emails, ';') from public.list_deal_emails('$RD')")" ",,," 'non-staff receive null for sent_by, mailbox_profile_id, and template_key, and an empty bcc list'
ok "$(as_val "$BY" "select count(*) from public.list_deal_emails('$DD')")" "0" 'a non-demo party gets 0 emails on a demo file'

q -f "$ROOT/supabase/rollbacks/20261131270000_connect_6_gmail_messages.sql" >/dev/null
ok "$(val "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'list_deal_emails'")" "0" 'rollback drops list_deal_emails'
q -f "$ROOT/supabase/migrations/20261131270000_connect_6_gmail_messages.sql" >/dev/null
ok "$(as_val "$DA" "select count(*) from public.list_deal_emails('$RD')")" "0" 're-applied function still hides a real file from a demo admin'

[ "$fail" = 0 ] && echo "connect-6 gmail messages sql passed"
exit "$fail"
