#!/bin/bash
# TC-ASSIGN-1 (John Coester, Nov 21 2026): an agent assigned to a transaction coordinator (admin level, the coordinator's contact record,
# or within a file) works both ways, and the coordinator then goes on all of that agent's files. Disposable local Postgres only.
# Does not connect to TEST and does not use its data. The functions being replaced start from the exact TEST bodies
# (test/sql/tc-assign-helpers.sql), so the migration's drift check runs for real.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/cla-tc-assign-XXXXXX")"
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

q <<'SQL'
create schema private; create schema extensions;
create role authenticated nologin; create role anon nologin;
grant usage on schema public, private to authenticated;
create table public.profiles (id uuid primary key, role text, status text default 'active');
create table public.contacts (id uuid primary key, profile_id uuid, first_name text default '', last_name text default '', email text, phone text, company text);
create table public.deals (id uuid primary key, file_number text, status text default 'Open', transaction_type text default 'Purchase');
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid not null, contact_id uuid not null, role text not null);
create table public.agent_tc_links (id uuid primary key default gen_random_uuid(), agent_contact_id uuid not null, tc_contact_id uuid not null,
  created_by uuid, created_at timestamptz not null default now(), constraint agent_tc_links_distinct check (agent_contact_id <> tc_contact_id),
  constraint agent_tc_links_pair unique (agent_contact_id, tc_contact_id));
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create function private.contact_visible(c uuid) returns boolean language sql stable as $$ select true $$;
SQL
q -f "$ROOT/test/sql/tc-assign-helpers.sql" >/dev/null

# people: agents A, B, C, D (co-agent), coordinators T (backfill), T2 (file add), T3 (agent added later), S (staff login)
q <<'SQL'
insert into public.profiles values ('99999999-0000-0000-0000-000000000001', 'Processor', 'active');
insert into public.contacts (id, first_name, email, profile_id) values
 ('a0000000-0000-0000-0000-00000000000a', 'Agent A', 'a@x.test', null), ('a0000000-0000-0000-0000-00000000000b', 'Agent B', 'b@x.test', null),
 ('a0000000-0000-0000-0000-00000000000c', 'Agent C', 'c@x.test', null), ('a0000000-0000-0000-0000-00000000000d', 'Agent D', 'd@x.test', null),
 ('70000000-0000-0000-0000-000000000001', 'TC T', 't@x.test', null), ('70000000-0000-0000-0000-000000000002', 'TC T2', 't2@x.test', null),
 ('70000000-0000-0000-0000-000000000003', 'TC T3', 't3@x.test', null), ('70000000-0000-0000-0000-000000000009', 'Staff S', 's@x.test', '99999999-0000-0000-0000-000000000001');
insert into public.deals (id, file_number, status, transaction_type) values
 ('d0000000-0000-0000-0000-000000000001', 'F1', 'Open', 'Purchase'), ('d0000000-0000-0000-0000-000000000002', 'F2', 'Closed', 'Purchase'),
 ('d0000000-0000-0000-0000-000000000003', 'F3', 'Open', 'Purchase'), ('d0000000-0000-0000-0000-000000000004', 'F4', 'Open', 'Refinance'),
 ('d0000000-0000-0000-0000-000000000005', 'F5', 'Open', 'Purchase'), ('d0000000-0000-0000-0000-000000000006', 'F6', 'Closed', 'Purchase'),
 ('d0000000-0000-0000-0000-000000000007', 'F7', 'Open', 'Purchase'), ('d0000000-0000-0000-0000-000000000008', 'F8', 'On Hold', 'Purchase'),
 ('d0000000-0000-0000-0000-000000000009', 'F9', 'Open', 'Purchase');
insert into public.deal_participants (deal_id, contact_id, role) values
 ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Buyer Agent TC'),
 ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Listing Agent'),
 ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000b', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000b', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000007', '70000000-0000-0000-0000-000000000003', 'Listing Agent TC'),
 ('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-00000000000c', 'Listing Agent'),
 ('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a', 'Buyer Agent'),
 ('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000d', 'Buyer Agent');
SQL
on() { val "select coalesce(string_agg(d.file_number || ':' || p.role, ',' order by d.file_number, p.role), '') from public.deal_participants p join public.deals d on d.id = p.deal_id join public.contacts c on c.id = p.contact_id where c.first_name = '$1' and p.role like '%TC'"; }
links() { val "select coalesce(string_agg(a.first_name || '>' || t.first_name, ',' order by a.first_name, t.first_name), '') from public.agent_tc_links l join public.contacts a on a.id = l.agent_contact_id join public.contacts t on t.id = l.tc_contact_id"; }

ok "$(links)" "" 'before: no links'
ok "$(on 'TC T')" "F1:Buyer Agent TC" 'before: TC T is only on the file someone put them on'

q -f "$ROOT/supabase/migrations/20261127990000_tc_assign_agents.sql" >/dev/null
ok "$(links)" "Agent A>TC T" 'one-time: TC T on F1 next to Agent A is linked to Agent A (not to the co-agent D)'
ok "$(on 'TC T')" "F1:Buyer Agent TC,F2:Buyer Agent TC,F3:Listing Agent TC,F9:Buyer Agent TC" 'TC T is on all of Agent A files: open, closed, and the listing side; not the refinance'

q -c "set app.uid = '99999999-0000-0000-0000-000000000001'; insert into public.deal_participants (deal_id, contact_id, role) values ('d0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000002', 'Buyer Agent TC')"
ok "$(val "select count(*) from public.agent_tc_links l join public.contacts a on a.id = l.agent_contact_id join public.contacts t on t.id = l.tc_contact_id where a.first_name = 'Agent B' and t.first_name = 'TC T2'")" "1" 'within a file: adding TC T2 next to Agent B links them'
ok "$(on 'TC T2')" "F5:Buyer Agent TC,F6:Buyer Agent TC" 'TC T2 then goes on Agent B closed file too'

q -c "insert into public.deal_participants (deal_id, contact_id, role) values ('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-00000000000c', 'Listing Agent')"
ok "$(val "select count(*) from public.agent_tc_links l join public.contacts a on a.id = l.agent_contact_id join public.contacts t on t.id = l.tc_contact_id where a.first_name = 'Agent C' and t.first_name = 'TC T3'")" "1" 'within a file: adding Agent C next to TC T3 links them'
ok "$(on 'TC T3')" "F7:Listing Agent TC,F8:Listing Agent TC" 'TC T3 then goes on Agent C on-hold file too'

ok "$(val "select count(*) from public.agent_tc_links l join public.contacts a on a.id = l.agent_contact_id where a.first_name = 'Agent D'")" "0" 'no chaining: TC T placed on F9 by the link is not linked to co-agent D'

q -c "insert into public.deal_participants (deal_id, contact_id, role) values ('d0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000009', 'Buyer Agent TC')"
ok "$(val "select count(*) from public.agent_tc_links where tc_contact_id = '70000000-0000-0000-0000-000000000009'")" "0" 'a CLA staff login on a file as a coordinator is never linked'

# admin level / coordinator record: link from the coordinator side, then the coordinator's agent list
q -c "insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('a0000000-0000-0000-0000-00000000000d', '70000000-0000-0000-0000-000000000002')"
ok "$(on 'TC T2')" "F5:Buyer Agent TC,F6:Buyer Agent TC,F9:Buyer Agent TC" 'a link saved on the coordinator record puts TC T2 on Agent D files'
ok "$(PGOPTIONS='-c app.uid=99999999-0000-0000-0000-000000000001' val "select string_agg(first_name, ',' order by first_name) from public.tc_agents('70000000-0000-0000-0000-000000000002')")" "Agent B,Agent D" 'tc_agents lists the agents a coordinator works with'
out=$(psql -X -q -tA -c "select * from public.tc_agents('70000000-0000-0000-0000-000000000002')" 2>&1 || true)
case "$out" in *"Please sign in"*) echo "ok tc_agents needs a signed-in user";; *) echo "FAIL tc_agents without a user: $out"; fail=1;; esac
ok "$(val "select has_function_privilege('authenticated', 'public.tc_agents(uuid)', 'execute')::text || has_function_privilege('anon', 'public.tc_agents(uuid)', 'execute')::text || has_function_privilege('authenticated', 'private.link_tcs_from_file()', 'execute')::text")" "truefalsefalse" 'only signed-in users can call tc_agents; the helpers are private'

# a refinance file never gets a coordinator
ok "$(val "select count(*) from public.deal_participants where deal_id = 'd0000000-0000-0000-0000-000000000004' and role like '%TC'")" "0" 'the refinance file gets no coordinator'

# rollback, then the file applies again (drift check passes on the restored TEST body)
q -f "$ROOT/supabase/rollbacks/20261127990000_tc_assign_agents.sql" >/dev/null
ok "$(val "select to_regprocedure('public.tc_agents(uuid)') is null and not exists (select 1 from pg_trigger where tgname = 'participants_tc_link')")" "t" 'rollback removes the new function and trigger'
q -f "$ROOT/supabase/migrations/20261127990000_tc_assign_agents.sql" >/dev/null
ok "$(val "select to_regprocedure('public.tc_agents(uuid)') is not null")" "t" 'the file applies again after the rollback'

exit $fail
