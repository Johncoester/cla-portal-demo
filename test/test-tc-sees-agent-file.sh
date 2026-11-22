#!/bin/bash
# TC-VIS-1 (John Coester, Nov 20-21 2026): a transaction coordinator sees everything their agent sees on the file,
# open and closed tasks, commissions and other agent fees. Disposable local Postgres only. Does not connect to TEST
# and does not use its data. The functions being replaced start from the exact TEST bodies (the rollback file),
# so the migration's drift check runs for real.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/cla-tc-vis-XXXXXX")"
PORT=$(( 56000 + RANDOM % 4000 ))
cleanup() { "$BIN/pg_ctl" -D "$DATA/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"$BIN/initdb" -D "$DATA/db" --username=postgres --auth=trust --no-instructions >/dev/null
"$BIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null
export PGHOST="$DATA" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

q <<'SQL'
set check_function_bodies = off;
create schema auth; create schema private; create schema extensions;
create role authenticated nologin; create role anon nologin;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public, private to authenticated;
create table public.profiles (id uuid primary key, role text, status text default 'active', is_admin boolean default false, is_demo boolean default false,
  first_name text default '', last_name text default '', email text);
create table public.contacts (id uuid primary key, profile_id uuid, first_name text default '', last_name text default '', email text, contact_type text);
create table public.deals (id uuid primary key, status text default 'Open', transaction_type text default 'Purchase', tc_user_id uuid,
  preprocessor_user_id uuid, processor_id uuid, file_number text, street text, city text, state text, zip text, closing_date date, is_demo boolean default false);
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid not null, contact_id uuid not null, role text not null);
create index on public.deal_participants (deal_id); create index on public.deal_participants (contact_id);
create table public.deal_sales_people (deal_id uuid, sales_id uuid);
create table public.team_members (team_id uuid, profile_id uuid, member_role text);
create table public.agent_tc_links (id uuid primary key default gen_random_uuid(), agent_contact_id uuid not null, tc_contact_id uuid not null,
  created_by uuid, created_at timestamptz default now(), unique (agent_contact_id, tc_contact_id));
create table public.task_templates (id uuid primary key, fields jsonb default '[]');
create table public.tasks (id uuid primary key, deal_id uuid, title text default 'Task', description text, assigned_role text, status text default 'todo',
  due_date date, completed_at timestamptz, completed_by uuid, created_by uuid, created_at timestamptz default now(), kind text default 'simple',
  participant_id uuid, owner_profile_id uuid, template_id uuid, template_code text, template_version int, saved_at timestamptz, saved_by uuid,
  form_data jsonb, audiences text[]);
create table private.view_as_sessions (actor_id uuid, target_id uuid, started_at timestamptz default now(), expires_at timestamptz, stopped_at timestamptz);
create table public.activity (deal_id uuid, kind text, note text);
grant select on public.tasks, public.deals to authenticated;
alter table public.tasks enable row level security;
-- Stand-ins for helpers the changed functions call but that are not under test.
create function private.lock_function_search_paths() returns void language sql as $$ select $$;
create function private.agent_can_fill(p_task uuid) returns boolean language sql stable as $$ select false $$;
create function private.validate_form(f jsonb, data jsonb, complete boolean, d uuid) returns jsonb language sql stable as $$ select data $$;
create function private.fields_for_role(f jsonb, r text) returns jsonb language sql stable as $$ select f $$;
create function private.person_label(pid uuid, d uuid) returns text language sql stable as $$ select private.person_name(pid) $$;
create function private.person_label(pid uuid, d uuid, r text) returns text language sql stable as $$ select private.person_name(pid) $$;
create function private.log_activity(d uuid, k text, e text, id uuid, note text) returns void language sql as $$ insert into public.activity values (d, k, note) $$;
create function private.notify(ids uuid[], k text, d uuid, title text, link text) returns void language sql as $$ select $$;
create function private.masked_keys(t uuid) returns text[] language sql stable as $$ select '{}'::text[] $$;
create function private.board_owner_names(ids uuid[]) returns table (deal_id uuid, participant_id uuid, owner_name text) language sql stable as $$ select null::uuid, null::uuid, null::text where false $$;
create function private.outside_readable_task_ids() returns setof uuid language sql stable as $$ select null::uuid where false $$;   -- the rollback file puts back the TEST body
create function private.reader_deal_ids() returns setof uuid language sql stable as $$ select id from public.deals $$;
SQL
PGOPTIONS="-c check_function_bodies=off" q -f "$ROOT/test/sql/tc-sees-agent-helpers.sql" >/dev/null
q <<'SQL'
-- The TEST tasks_select policy (Nov 21 2026).
create policy tasks_select on public.tasks for select to authenticated using (
CASE
    WHEN ( SELECT (g.active AND (g.is_admin OR COALESCE((g.role = ANY (ARRAY['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text])), false)))
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)) THEN true
    WHEN ( SELECT g.staffish
       FROM private.reader_gate() g(uid, role, active, is_admin, staffish, is_processor, is_demo, contact_id)) THEN (deal_id IN ( SELECT private.reader_deal_ids() AS reader_deal_ids))
    ELSE (id IN ( SELECT private.outside_readable_task_ids() AS outside_readable_task_ids))
END);
-- Fake people. 1x = profiles, 2x = contacts, 3x = deals, 4x = tasks.
insert into public.profiles (id, role, first_name, last_name) values
 ('11111111-0000-0000-0000-000000000001', 'Processor', 'Pat', 'Processor'),
 ('11111111-0000-0000-0000-000000000002', 'Outside user', 'Ava', 'Buyeragent'),
 ('11111111-0000-0000-0000-000000000003', 'Outside user', 'Tia', 'Coordinator'),
 ('11111111-0000-0000-0000-000000000004', 'Outside user', 'Leo', 'Listingagent'),
 ('11111111-0000-0000-0000-000000000005', 'Outside user', 'Bea', 'Buyer'),
 ('11111111-0000-0000-0000-000000000006', 'Transaction Coordinator', 'Sam', 'Stafftc'),
 ('11111111-0000-0000-0000-000000000007', 'Outside user', 'Lia', 'Linkedtc'),
 ('11111111-0000-0000-0000-000000000008', 'Outside user', 'Sid', 'Stranger');
insert into public.contacts (id, profile_id, first_name, last_name) values
 ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Ava', 'Buyeragent'),
 ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Tia', 'Coordinator'),
 ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000004', 'Leo', 'Listingagent'),
 ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000005', 'Bea', 'Buyer'),
 ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000006', 'Sam', 'Stafftc'),
 ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000007', 'Lia', 'Linkedtc'),
 ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000008', 'Sid', 'Stranger'),
 ('22222222-0000-0000-0000-000000000009', null, 'Noa', 'Nologinagent');
insert into public.deals (id, status, file_number) values
 ('33333333-0000-0000-0000-000000000001', 'Open', 'MD-26-00001'),
 ('33333333-0000-0000-0000-000000000002', 'Closed', 'MD-26-00002'),
 ('33333333-0000-0000-0000-000000000003', 'Open', 'MD-26-00003');
insert into public.deal_participants (id, deal_id, contact_id, role) values
 ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Buyer Agent'),
 ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Buyer Agent TC'),
 ('55555555-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'Listing Agent'),
 ('55555555-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005', 'Client-Buyer'),
 ('55555555-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000006', 'Listing Agent TC'),
 ('55555555-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Buyer Agent'),
 ('55555555-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000003', 'Buyer Agent TC'),
 ('55555555-0000-0000-0000-000000000008', '33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000009', 'Buyer Agent'),
 ('55555555-0000-0000-0000-000000000009', '33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', 'Buyer Agent TC');
-- Lia is linked to Leo the old way (agent_tc_links) and is not on the file.
insert into public.agent_tc_links (agent_contact_id, tc_contact_id) values ('22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000007');
insert into public.task_templates (id) values ('66666666-0000-0000-0000-000000000001');
insert into public.tasks (id, deal_id, title, assigned_role, status, kind, participant_id, owner_profile_id, template_id, audiences, form_data) values
 ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Agent open', 'Buyer Agent', 'todo', 'agent', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', null, null, '{"a":1}'),
 ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'Agent form done', 'Buyer Agent', 'done', 'form', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', null, '{"b":2}'),
 ('44444444-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', 'Listing agent task', 'Listing Agent', 'todo', 'agent', '55555555-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004', null, null, null),
 ('44444444-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 'Buyer task', 'Client-Buyer', 'todo', 'simple', '55555555-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000005', null, null, null),
 ('44444444-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000001', 'Buyer agent one-off', 'Buyer Agent', 'todo', 'simple', null, null, null, null, null),
 ('44444444-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001', 'Agent audience task', 'Buyer Agent', 'todo', 'simple', '55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', null, array['buyer_agent'], null),
 ('44444444-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000002', 'Closed file agent task', 'Buyer Agent', 'done', 'agent', '55555555-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002', null, null, '{"c":3}'),
 ('44444444-0000-0000-0000-000000000008', '33333333-0000-0000-0000-000000000003', 'No-login agent form', 'Buyer Agent', 'todo', 'form', '55555555-0000-0000-0000-000000000008', null, '66666666-0000-0000-0000-000000000001', null, '{}'),
 ('44444444-0000-0000-0000-000000000009', '33333333-0000-0000-0000-000000000001', 'Processor task', 'Processor', 'todo', 'simple', null, null, null, null, null);
create table public.tc_results (name text, ok boolean, detail text);
-- One check as one fake person. Every helper runs as role authenticated, the same as the portal.
create function public.as_user(p uuid, q text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('cla.effective_uid_for', '', true);
  set local role authenticated;
  execute q into r;
  reset role;
  return r;
end $$;
create function public.visible_titles(p uuid) returns text language sql as $$
  select public.as_user(p, 'select coalesce(string_agg(title, '','' order by title), '''') from public.tasks') $$;
SQL

TC=11111111-0000-0000-0000-000000000003; AG=11111111-0000-0000-0000-000000000002; LA=11111111-0000-0000-0000-000000000004
BU=11111111-0000-0000-0000-000000000005; ST=11111111-0000-0000-0000-000000000006; LI=11111111-0000-0000-0000-000000000007
SI=11111111-0000-0000-0000-000000000008; PR=11111111-0000-0000-0000-000000000001
D1=33333333-0000-0000-0000-000000000001
grant_all() { q -c "grant execute on all functions in schema private to authenticated; revoke all on function private.tc_for_agent(uuid,uuid,uuid,text), private.linked_agent_roles(uuid,uuid) from authenticated;" >/dev/null; }
val() { psql -X -q -tA -v ON_ERROR_STOP=1 -c "$1"; }
FAILS=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected [$3] got [$2]"; FAILS=$((FAILS+1)); fi; }

# Before: the exact TEST bodies.
q -f "$ROOT/supabase/rollbacks/20261126990000_tc_sees_agent_file.sql" >/dev/null 2>&1 || q -f "$ROOT/supabase/rollbacks/20261126990000_tc_sees_agent_file.sql"
grant_all
echo "-- before (TEST today)"
check "before: a coordinator on the file sees none of the agent's tasks" "$(val "select public.visible_titles('$TC')")" ""
BEFORE_AG=$(val "select public.visible_titles('$AG')"); BEFORE_LA=$(val "select public.visible_titles('$LA')"); BEFORE_BU=$(val "select public.visible_titles('$BU')")
BEFORE_LI=$(val "select public.visible_titles('$LI')"); BEFORE_SI=$(val "select public.visible_titles('$SI')"); BEFORE_PR=$(val "select public.visible_titles('$PR')")

q -f "$ROOT/supabase/migrations/20261126990000_tc_sees_agent_file.sql" >/dev/null
grant_all
echo "-- after"
check "coordinator on the file sees the agent's open and closed tasks, on open and closed files" "$(val "select public.visible_titles('$TC')")" "Agent audience task,Agent form done,Agent open,Buyer agent one-off,Closed file agent task,No-login agent form"
check "coordinator acts as the buyer's agent on the file" "$(val "select public.as_user('$TC', 'select private.deal_roles(''$D1'')::text')")" "{\"Buyer Agent\"}"
check "coordinator's agent fees: buyer side like the agent" "$(val "select public.as_user('$TC', 'select coalesce(private.agent_fee_actor(''$D1'', ''buyer''), ''none'')')")" "agent"
check "coordinator does not get the other side's fees" "$(val "select public.as_user('$TC', 'select coalesce(private.agent_fee_actor(''$D1'', ''listing''), ''none'')')")" "none"
check "staff-role coordinator on the listing side reads the listing fees" "$(val "select public.as_user('$ST', 'select coalesce(private.agent_fee_actor(''$D1'', ''listing''), ''none'')')")" "tc"
check "staff-role coordinator is not given the buyer side" "$(val "select public.as_user('$ST', 'select coalesce(private.agent_fee_actor(''$D1'', ''buyer''), ''none'')')")" "none"
check "the agent's fees are unchanged" "$(val "select public.as_user('$AG', 'select coalesce(private.agent_fee_actor(''$D1'', ''buyer''), ''none'')')")" "agent"
check "the processor's fees are unchanged" "$(val "select public.as_user('$PR', 'select coalesce(private.agent_fee_actor(''$D1'', ''buyer''), ''none'')')")" "staff"
check "a stranger gets no fees" "$(val "select public.as_user('$SI', 'select coalesce(private.agent_fee_actor(''$D1'', ''buyer''), ''none'')')")" "none"
check "coordinator reads the agent's form answers" "$(val "select public.as_user('$TC', 'select private.rpc_get_task_form(''44444444-0000-0000-0000-000000000002'')::text')")" '{"b": 2}'
check "coordinator answers-visible on the agent's closed task" "$(val "select public.as_user('$TC', 'select private.agent_answers_visible(t)::text from public.tasks t where t.id = ''44444444-0000-0000-0000-000000000007''')")" "true"
check "listing agent cannot open the buyer agent's form answers" "$(val "select public.as_user('$LA', 'select coalesce((select private.agent_answers_visible(t)::text from public.tasks t where t.id = ''44444444-0000-0000-0000-000000000002''), ''not visible'')')")" "not visible"
check "coordinator fills the no-login agent's form" "$(val "select public.as_user('$TC', 'select private.rpc_save_task_form(''44444444-0000-0000-0000-000000000008'', ''{\"x\":1}''::jsonb, true)')")" "done"
check "it is recorded on behalf of the agent" "$(val "select note from public.activity order by note desc limit 1")" "No-login agent form: completed by Tia Coordinator (transaction coordinator) on behalf of Noa Nologinagent"
check "the form still has no owner" "$(val "select coalesce(owner_profile_id::text, 'none') || ',' || completed_by from public.tasks where id = '44444444-0000-0000-0000-000000000008'")" "none,$TC"
if val "select public.as_user('$LA', 'select private.rpc_save_task_form(''44444444-0000-0000-0000-000000000001'', ''{}''::jsonb, false)')" >/dev/null 2>&1; then
  check "listing agent cannot fill the buyer agent's task" "allowed" "refused"; else check "listing agent cannot fill the buyer agent's task" "refused" "refused"; fi
check "coordinator's My Tasks (open files) has the agent's tasks" "$(val "select public.as_user('$TC', 'select string_agg(title, '','' order by title) from public.my_task_list(''Open'')')")" "Agent audience task,Agent form done,Agent open,Buyer agent one-off,No-login agent form"
check "coordinator's My Tasks (all files) adds the closed file" "$(val "select public.as_user('$TC', 'select count(*)::text from public.my_task_list(''All'')')")" "6"
check "listing agent's My Tasks is unchanged" "$(val "select public.as_user('$LA', 'select string_agg(title, '','' order by title) from public.my_task_list(''Open'')')")" "Listing agent task"
check "regression: buyer's agent sees the same tasks" "$(val "select public.visible_titles('$AG')")" "$BEFORE_AG"
check "regression: listing agent sees the same tasks" "$(val "select public.visible_titles('$LA')")" "$BEFORE_LA"
check "regression: buyer sees the same tasks" "$(val "select public.visible_titles('$BU')")" "$BEFORE_BU"
check "regression: linked coordinator (agent_tc_links) sees the same tasks" "$(val "select public.visible_titles('$LI')")" "$BEFORE_LI"
check "regression: linked coordinator still sees the listing agent's task" "$BEFORE_LI" "Listing agent task"
check "regression: a stranger sees nothing" "$(val "select public.visible_titles('$SI')")" "$BEFORE_SI"
check "regression: processor sees every task" "$(val "select public.visible_titles('$PR')")" "$BEFORE_PR"

q -f "$ROOT/supabase/rollbacks/20261126990000_tc_sees_agent_file.sql" >/dev/null
grant_all
check "rollback: back to TEST today" "$(val "select public.visible_titles('$TC')")" ""
q -f "$ROOT/supabase/migrations/20261126990000_tc_sees_agent_file.sql" >/dev/null
grant_all
check "the migration applies again after a rollback" "$(val "select count(*)::text from regexp_split_to_table(public.visible_titles('$TC'), ',')")" "6"
if [ "$FAILS" != "0" ]; then echo "$FAILS failed"; exit 1; fi
echo "tc sees agent file: all checks passed"
